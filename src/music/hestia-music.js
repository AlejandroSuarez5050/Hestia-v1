import messages from '../core/messages.js';
import env from '../config/env.js';
import logger from '../core/logger.js';
import guildState from '../state/guild-state.store.js';
import playerService from './player.service.js';
import queueService from './queue.service.js';
import searchService from './search.service.js';
import spotifyService from './spotify.service.js';
import {buildPlayerPanel} from './ui/player-panel.js';
import {buildQueuePanel} from './ui/queue-panel.js';

const panelUpdateLocks = new Map();

async function withPanelLock(guildId, task) {
  const prev = panelUpdateLocks.get(guildId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const current = prev.then(() => gate);
  panelUpdateLocks.set(guildId, current);

  await prev;
  try {
    return await task();
  } finally {
    release();
    if (panelUpdateLocks.get(guildId) === current) {
      panelUpdateLocks.delete(guildId);
    }
  }
}

async function resolveSpotifyTracksToYoutube(player, spotifyTracks, user, label = 'principal') {
  const resolved = new Array(spotifyTracks.length);
  let cursor = 0;
  let completed = 0;
  const concurrency = Math.max(1, Math.min(env.spotifyFallbackSearchConcurrency, spotifyTracks.length));

  async function resolveOne(item) {
    let searchResult = null;
    if (item.isrc) {
      searchResult = await player.search({ query: `ytsearch:"${item.isrc}"` }, user).catch(() => null);
    }
    if (!searchResult?.tracks?.length) {
      const queryText = `ytmsearch:${item.artist} ${item.name}`.trim();
      searchResult = await player.search({ query: queryText }, user).catch(() => null);
    }
    const track = searchResult?.tracks?.[0];
    return track ?? null;
  }

  async function worker() {
    while (cursor < spotifyTracks.length) {
      const index = cursor;
      cursor += 1;
      resolved[index] = await resolveOne(spotifyTracks[index]);
      completed += 1;
      if (completed % 25 === 0 || completed === spotifyTracks.length) {
        logger.info(`Spotify fallback: progreso busqueda YT/YTM ${label} ${completed}/${spotifyTracks.length}`);
      }
    }
  }

  logger.info(`Spotify fallback: resolviendo ${spotifyTracks.length} tracks en YT/YTM (${label}) con concurrencia=${concurrency}`);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const playableTracks = resolved.filter(Boolean);
  logger.info(`Spotify fallback: tracks resueltos en YT/ YTM (${label}) = ${playableTracks.length}/${spotifyTracks.length}`);
  return playableTracks;
}

async function resolveSpotifyPlaylistFallback(player, query, user, { progressive = true } = {}) {
  logger.info('Spotify fallback: iniciando resolucion de playlist por API directa');
  const playlistId = spotifyService.extractPlaylistId(query);
  if (!playlistId) return { found: false, reason: 'spotify_playlist_forbidden' };

  let spotifyTracks;
  try {
    spotifyTracks = await spotifyService.fetchPlaylistTracks(playlistId, env.playlistMaxTracks);
  } catch (error) {
    logger.warn(`Spotify fallback: error al leer playlist en Spotify API: ${error?.message ?? error}`);
    if (String(error?.message || '').includes('missing_credentials')) {
      return { found: false, reason: 'spotify_fallback_missing_credentials' };
    }
    if (String(error?.message || '').includes('spotify_playlist_not_owner_or_collaborator') || String(error?.message || '').includes('spotify_playlist_not_in_user_library')) {
      return { found: false, reason: 'spotify_fallback_forbidden' };
    }
    return { found: false, reason: 'spotify_playlist_forbidden' };
  }

  if (!spotifyTracks.length) {
    return { found: false, reason: 'spotify_fallback_no_tracks' };
  }

  const cap = spotifyTracks.slice(0, env.playlistMaxTracks);
  const initialBatchSize = progressive ? Math.max(1, Math.min(env.spotifyFallbackInitialBatch, cap.length)) : cap.length;
  const initialItems = cap.slice(0, initialBatchSize);
  const deferredItems = cap.slice(initialBatchSize);
  const playableTracks = await resolveSpotifyTracksToYoutube(player, initialItems, user, 'inicial');

  if (!playableTracks.length) {
    return { found: false, reason: 'spotify_fallback_no_tracks' };
  }

  return {
    found: true,
    type: 'playlist',
    name: 'Spotify Playlist (fallback)',
    tracks: playableTracks,
    fallbackTotal: cap.length,
    fallbackQueued: playableTracks.length,
    deferredSpotifyTracks: deferredItems,
  };
}

async function resolveSpotifyAlbumFallback(player, query, user, { progressive = true } = {}) {
  logger.info('Spotify fallback: iniciando resolucion de album por API directa');
  const albumId = spotifyService.extractAlbumId(query);
  if (!albumId) return { found: false, reason: 'spotify_album_forbidden' };

  let spotifyTracks;
  try {
    spotifyTracks = await spotifyService.fetchAlbumTracks(albumId, env.playlistMaxTracks);
  } catch (error) {
    logger.warn(`Spotify fallback: error al leer album en Spotify API: ${error?.message ?? error}`);
    if (String(error?.message || '').includes('missing_credentials')) {
      return { found: false, reason: 'spotify_fallback_missing_credentials' };
    }
    return { found: false, reason: 'spotify_album_forbidden' };
  }

  if (!spotifyTracks.length) {
    return { found: false, reason: 'spotify_fallback_no_tracks' };
  }

  const cap = spotifyTracks.slice(0, env.playlistMaxTracks);
  const initialBatchSize = progressive ? Math.max(1, Math.min(env.spotifyFallbackInitialBatch, cap.length)) : cap.length;
  const initialItems = cap.slice(0, initialBatchSize);
  const deferredItems = cap.slice(initialBatchSize);
  const playableTracks = await resolveSpotifyTracksToYoutube(player, initialItems, user, 'inicial-album');

  if (!playableTracks.length) {
    return { found: false, reason: 'spotify_fallback_no_tracks' };
  }

  return {
    found: true,
    type: 'playlist',
    name: 'Spotify Album (fallback)',
    tracks: playableTracks,
    fallbackTotal: cap.length,
    fallbackQueued: playableTracks.length,
    deferredSpotifyTracks: deferredItems,
  };
}

async function upsertPlayerMessage(client, guildId, channel) {
  await withPanelLock(guildId, async () => {
    const player = playerService.getPlayer(client, guildId);
    if (!player?.queue.current) return;
    const state = guildState.get(guildId);
    const panel = buildPlayerPanel(player, state.autoplay, state.currentTrackInfo);
    if (!panel) return;

    if (!state.playerMessage) {
      const msg = await channel.send(panel);
      state.playerMessage = { channelId: channel.id, messageId: msg.id, queueSelection: null };
      return;
    }

    const textChannel = await client.channels.fetch(state.playerMessage.channelId).catch(() => null);
    if (!textChannel) {
      logger.warn(`UI: canal del panel no encontrado en guild ${guildId}, limpiando referencia`);
      state.playerMessage = null;
      return;
    }
    const msg = await textChannel.messages.fetch(state.playerMessage.messageId).catch(() => null);
    if (!msg) {
      logger.warn(`UI: mensaje del panel no encontrado en guild ${guildId}, limpiando referencia`);
      state.playerMessage = null;
      return;
    }
    await msg.edit(panel).catch((error) => {
      logger.warn(`UI: fallo al editar panel en guild ${guildId}: ${error?.message ?? error}`);
    });
  });
}

async function deletePlayerMessage(client, guildId) {
  const state = guildState.get(guildId);
  const ref = state.playerMessage;
  if (!ref) return false;

  const textChannel = await client.channels.fetch(ref.channelId).catch(() => null);
  if (!textChannel) {
    state.playerMessage = null;
    return false;
  }

  const msg = await textChannel.messages.fetch(ref.messageId).catch(() => null);
  if (!msg) {
    state.playerMessage = null;
    return false;
  }

  await msg.delete().catch(() => {});
  state.playerMessage = null;
  return true;
}

async function cleanupBotMessagesInChannel(client, guildId, channelId, limit = 100, deep = false) {
  const state = guildState.get(guildId);
  const textChannel = await client.channels.fetch(channelId).catch(() => null);
  if (!textChannel?.messages?.fetch) return 0;

  await deletePlayerMessage(client, guildId).catch(() => {});

  let deleted = 0;

  const maxPasses = deep ? 8 : 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const maxToScan = Math.max(1, Math.min(limit, 1000));
    let scanned = 0;
    let before;
    let deletedThisPass = 0;

    while (scanned < maxToScan) {
      const batchSize = Math.min(100, maxToScan - scanned);
      const messages = await textChannel.messages.fetch({ limit: batchSize, ...(before ? { before } : {}) }).catch(() => null);
      if (!messages || messages.size === 0) break;

      scanned += messages.size;
      before = messages.last()?.id;

      const mine = [...messages.values()].filter((m) => m.author?.id === client.user?.id);
      for (const msg of mine) {
        await msg.delete().then(() => {
          deleted += 1;
          deletedThisPass += 1;
        }).catch(() => {});
      }

      if (!before) break;
    }

    if (!deep || deletedThisPass === 0) break;
  }

  if (state.playerMessage?.channelId === channelId) {
    state.playerMessage = null;
  }
  return deleted;
}

async function play({ client, interaction, query, playNext, playlistOnly = false }) {
  await interaction.deferReply({ ephemeral: true });

  const voice = interaction.member.voice.channel;
  if (!voice) return interaction.editReply({ content: messages.notInVoice });

  const player = playerService.getOrCreatePlayer(client, interaction.guild.id, voice.id, interaction.channel.id);
  if (player.voiceChannelId && player.voiceChannelId !== voice.id) {
    return interaction.editReply({ content: messages.sameVoiceRequired });
  }

  let result = playlistOnly
    ? await searchService.resolvePlaylist(player, query, interaction.user)
    : await searchService.resolve(player, query, interaction.user);
  if (!result.found && result.reason === 'spotify_playlist_forbidden' && spotifyService.isSpotifyPlaylistUrl(query)) {
    await interaction.editReply({ content: messages.spotifyFallbackStart });
    result = await resolveSpotifyPlaylistFallback(player, query, interaction.user, { progressive: !playNext });
  } else if (!result.found && spotifyService.isSpotifyAlbumUrl(query)) {
    await interaction.editReply({ content: messages.spotifyFallbackStart });
    result = await resolveSpotifyAlbumFallback(player, query, interaction.user, { progressive: !playNext });
  }

  if (!result.found) {
    const content = result.reason === 'spotify_disabled'
      ? messages.spotifyDisabled
      : result.reason === 'playlist_only_no_results'
        ? messages.playlistOnlyNoResults
        : result.reason === 'spotify_fallback_missing_credentials'
        ? messages.spotifyFallbackCredentials
        : result.reason === 'spotify_fallback_forbidden'
          ? messages.spotifyFallbackForbidden
        : result.reason === 'spotify_fallback_no_tracks'
          ? messages.spotifyFallbackNoTracks
          : result.reason === 'spotify_playlist_forbidden'
            ? messages.spotifyPlaylistForbidden
            : messages.noResults;
    return interaction.editReply({ content });
  }

  if (result.type === 'playlist') {
    if (playNext) queueService.prepend(player, result.tracks);
    else queueService.append(player, result.tracks);
    if (!player.playing) await player.play();
    await interaction.deleteReply().catch(() => {});
    if (!playNext && result.deferredSpotifyTracks?.length) {
      resolveSpotifyTracksToYoutube(player, result.deferredSpotifyTracks, interaction.user, 'segundo-plano')
        .then(async (tracks) => {
          if (!tracks.length) return;
          queueService.append(player, tracks);
          logger.info(`Spotify fallback: agregadas ${tracks.length} canciones en segundo plano`);
          await upsertPlayerMessage(client, interaction.guild.id, interaction.channel);
        })
        .catch((error) => logger.warn(`Spotify fallback: segundo plano fallo (${error?.message ?? error})`));
    }
  } else {
    if (playNext) queueService.prepend(player, result.track);
    else queueService.append(player, result.track);
    if (!player.playing) await player.play();
    await interaction.deleteReply().catch(() => {});
  }

  await upsertPlayerMessage(client, interaction.guild.id, interaction.channel);
}

function getQueueView(client, guildId, page) {
  const player = playerService.getPlayer(client, guildId);
  if (!player) return { content: messages.nothingPlaying, ephemeral: true };
  return buildQueuePanel(player, page);
}

function selectQueueTrack(guildId, position) {
  const state = guildState.get(guildId);
  if (!state.playerMessage) return;
  state.playerMessage.queueSelection = Number.parseInt(position, 10);
}

function getSelection(guildId) {
  return guildState.get(guildId).playerMessage?.queueSelection ?? null;
}

function resetSelection(guildId) {
  const state = guildState.get(guildId);
  if (state.playerMessage) state.playerMessage.queueSelection = null;
}

export default {
  play,
  getQueueView,
  selectQueueTrack,
  getSelection,
  resetSelection,
  deletePlayerMessage,
  cleanupBotMessagesInChannel,
  upsertPlayerMessage,
  playerService,
  queueService,
  guildState,
};
