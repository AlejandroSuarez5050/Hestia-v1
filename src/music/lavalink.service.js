import {LavalinkManager} from 'lavalink-client';
import env from '../config/env.js';
import logger from '../core/logger.js';
import hestiaMusic from './hestia-music.js';

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const TITLE_NOISE_RE = /\b(official|video|audio|lyrics?|lyric video|topic|hd|4k|remaster(?:ed)?|version|visualizer|mv)\b/gi;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(TITLE_NOISE_RE, ' ')
    .replace(/feat\.?\s+[^-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trackKey(track) {
  const id = track?.info?.identifier || track?.info?.uri || '';
  if (id) return String(id);
  const title = track?.info?.title || '';
  const author = track?.info?.author || '';
  return `${author}::${title}`.toLowerCase();
}

function normalizedTrackKey(track) {
  const title = normalizeText(track?.info?.title);
  const author = normalizeText(track?.info?.author);
  return `${author}::${title}`;
}

function pushHistory(state, track) {
  if (!track) return;
  const key = trackKey(track);
  if (!key) return;
  state.autoplayHistory = Array.isArray(state.autoplayHistory) ? state.autoplayHistory : [];
  state.autoplayHistory.push(key);
  state.autoplayHistory.push(normalizedTrackKey(track));
  if (state.autoplayHistory.length > env.autoplayHistorySize) {
    state.autoplayHistory.splice(0, state.autoplayHistory.length - env.autoplayHistorySize);
  }
}

function buildRecentSet(player, state) {
  const recent = new Set(Array.isArray(state.autoplayHistory) ? state.autoplayHistory : []);
  if (player.queue.current) {
    recent.add(trackKey(player.queue.current));
    recent.add(normalizedTrackKey(player.queue.current));
  }
  for (const t of player.queue.tracks || []) {
    recent.add(trackKey(t));
    recent.add(normalizedTrackKey(t));
  }
  return recent;
}

function scoreCandidate(track, seedTrack) {
  const seedArtist = normalizeText(seedTrack?.info?.author);
  const seedTitle = normalizeText(seedTrack?.info?.title);
  const artist = normalizeText(track?.info?.author);
  const title = normalizeText(track?.info?.title);

  let score = 100;
  if (!title) score -= 100;
  if (title && seedTitle && title === seedTitle) score -= 80;
  if (artist && seedArtist && artist === seedArtist) score -= 45;
  if (title && seedTitle && (title.includes(seedTitle) || seedTitle.includes(title))) score -= 30;
  if (/\b(topic)\b/i.test(track?.info?.author || '')) score -= 10;
  return score;
}

function pickBestCandidates(candidates, recent, maxCount, seedTrack) {
  const scored = [];
  const seen = new Set();
  const artistCounter = new Map();
  const maxPerArtist = Math.max(1, env.autoplayMaxSameArtistPerBatch || 2);
  for (const track of candidates || []) {
    if (!track?.info?.title) continue;
    const key = trackKey(track);
    const normKey = normalizedTrackKey(track);
    if (!key || recent.has(key) || recent.has(normKey) || seen.has(key) || seen.has(normKey)) continue;
    const score = scoreCandidate(track, seedTrack);
    if (score < 10) continue;
    scored.push({ track, score, key, normKey });
    seen.add(key);
    seen.add(normKey);
  }

  scored.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const item of scored) {
    const artist = normalizeText(item.track?.info?.author) || 'unknown';
    const used = artistCounter.get(artist) || 0;
    if (used >= maxPerArtist) continue;
    picked.push(item.track);
    artistCounter.set(artist, used + 1);
    if (picked.length >= maxCount) break;
  }
  // If diversity cap was too strict, fill remaining slots without cap.
  if (picked.length < maxCount) {
    for (const item of scored) {
      if (picked.includes(item.track)) continue;
      picked.push(item.track);
      if (picked.length >= maxCount) break;
    }
  }
  return picked;
}

function extractVideoId(track) {
  const identifier = track?.info?.identifier;
  if (identifier && /^[a-zA-Z0-9_-]{8,}$/.test(identifier)) return identifier;
  const uri = track?.info?.uri || '';
  try {
    const url = new URL(uri);
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v) return v;
    }
    if (url.hostname.includes('youtu.be')) {
      const v = url.pathname.replace(/^\//, '');
      if (v) return v;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveAutoplayCandidates(player, lastTrack, state, maxCount) {
  const recent = buildRecentSet(player, state);
  const batchSize = Math.max(1, maxCount);
  const videoId = extractVideoId(lastTrack);

  if (videoId) {
    const radioUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
    logger.info(`Autoplay: intentando mix de YouTube para video ${videoId}`);
    const mixRes = await player.search({ query: radioUrl }).catch(() => null);
    const mixTracks = pickBestCandidates(mixRes?.tracks || [], recent, batchSize, lastTrack);
    if (mixTracks.length) return mixTracks;
    logger.warn('Autoplay: mix no devolvio candidatos nuevos, usando fallback textual');
  }

  const author = lastTrack?.info?.author || '';
  const title = lastTrack?.info?.title || '';
  const queries = [
    `ytmsearch:${title} similar songs`,
    `ytmsearch:songs like ${title}`,
    `ytmsearch:${author} related artists songs`,
    `ytmsearch:${author} radio`,
  ].filter(Boolean);

  for (const query of queries) {
    const res = await player.search({ query }).catch(() => null);
    const candidates = pickBestCandidates(res?.tracks || [], recent, batchSize, lastTrack);
    if (candidates.length) {
      logger.info(`Autoplay: fallback textual exitoso con query ${query}`);
      return candidates;
    }
  }

  return [];
}

async function ensureAutoplayQueue(client, player, reason = 'autoplay', options = {}) {
  const retry = Number.isInteger(options.retry) ? options.retry : 0;
  const force = Boolean(options.force);
  const state = hestiaMusic.guildState.get(player.guildId);
  if (!state.autoplay) return;
  const generation = Number.isInteger(options.generation) ? options.generation : state.autoplayGeneration;

  if (generation !== state.autoplayGeneration) {
    logger.info(`Autoplay: solicitud obsoleta descartada reason=${reason} gen_req=${generation} gen_actual=${state.autoplayGeneration}`);
    return;
  }

  if (state.autoplayFilling) {
    if (force) {
      logger.info(`Autoplay: forzando top-up sobre fill en progreso (${reason})`);
      state.autoplayFilling = false;
    }
    if (retry < 4) {
      logger.info(`Autoplay: fill en progreso reason=${reason} retry=${retry + 1} gen=${generation} fillingGen=${state.autoplayFillingGeneration}`);
      await sleep(350);
      return ensureAutoplayQueue(client, player, reason, { retry: retry + 1, force, generation });
    }
    logger.warn(`Autoplay: fill en progreso sin reintentos reason=${reason} gen=${generation} fillingGen=${state.autoplayFillingGeneration}`);
    return;
  }

  const target = Math.max(1, env.autoplayBatchSize);
  const queueSize = player.queue.tracks?.length ?? 0;
  const missing = target - queueSize;
  logger.info(`Autoplay: evaluar top-up reason=${reason} gen=${generation} target=${target} queue=${queueSize} missing=${missing}`);
  if (missing <= 0) return;

  const seed = player.queue.current || player.queue.previous?.[player.queue.previous.length - 1] || null;
  if (!seed) return;

  state.autoplayFilling = true;
  state.autoplayFillingGeneration = generation;
  logger.info(`Autoplay: fill start reason=${reason} gen=${generation} seed="${seed?.info?.title ?? 'unknown'}"`);
  try {
    const candidates = await resolveAutoplayCandidates(player, seed, state, missing);
    if (state.autoplayGeneration !== generation || state.autoplayFillingGeneration !== generation) {
      logger.warn(`Autoplay: resultado obsoleto descartado reason=${reason} gen=${generation} gen_actual=${state.autoplayGeneration} fillingGen=${state.autoplayFillingGeneration}`);
      return;
    }
    if (!candidates.length) {
      logger.warn(`Autoplay: sin candidatos para top-up en guild ${player.guildId}`);
      return;
    }

    player.queue.add(candidates);
    logger.info(`Autoplay: top-up ok reason=${reason} gen=${generation} agregadas=${candidates.length} guild=${player.guildId}`);
    if (!player.playing) await player.play().catch(() => {});
    await refreshPlayerPanel(client, player, `autoplayTopUp:${reason}`);
  } catch (error) {
    logger.warn(`Autoplay: error top-up reason=${reason} gen=${generation} err=${error?.message ?? error}`);
  } finally {
    if (state.autoplayFillingGeneration === generation) {
      state.autoplayFilling = false;
      logger.info(`Autoplay: fill end reason=${reason} gen=${generation}`);
    }
  }
}

async function refreshPlayerPanel(client, player, eventName) {
  const state = hestiaMusic.guildState.get(player.guildId);
  if (state.autoplay == null) state.autoplay = env.autoplayDefault;
  const channelId = player.textChannelId || state.playerMessage?.channelId;
  if (!channelId) {
    logger.warn(`${eventName}: no hay channelId para guild ${player.guildId}`);
    return;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    logger.warn(`${eventName}: no se pudo obtener canal ${channelId} para guild ${player.guildId}`);
    return;
  }
  try {
    await hestiaMusic.upsertPlayerMessage(client, player.guildId, channel);
    logger.debug(`${eventName}: panel actualizado para guild ${player.guildId}`);
  } catch (error) {
    logger.warn(`${eventName}: error al actualizar panel en guild ${player.guildId}: ${error?.message ?? error}`);
  }
}

export function createLavalink(client) {
  const lavalink = new LavalinkManager({
    nodes: [{
      host: env.lavalink.host,
      port: env.lavalink.port,
      authorization: env.lavalink.password,
      id: 'main-node',
      reconnectTimeout: 5000,
      reconnectTries: 10,
    }],
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
    },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: env.defaultSearchPlatform,
      clientBasedPositionUpdateInterval: 1000,
      onEmptyQueue: {
        destroyAfterMs: env.queueEmptyDestroyMs,
      },
    },
  });

function schedulePanelRefreshes(client, player, baseEventName) {
  const delays = [0, 500, 1500];
  for (const delay of delays) {
    setTimeout(() => {
      refreshPlayerPanel(client, player, `${baseEventName}:${delay}ms`).catch(() => {});
    }, delay);
  }
}

lavalink.on('trackStart', async (player, track) => {
  const state = hestiaMusic.guildState.get(player.guildId);
  const source = track?.info ?? player.queue.current?.info ?? null;
  if (source) {
    state.currentTrackInfo = {
      title: source.title ?? 'Desconocido',
      author: source.author ?? 'Desconocido',
      uri: source.uri ?? '#',
      identifier: source.identifier ?? '',
    };
  }
  pushHistory(state, player.queue.current);
  schedulePanelRefreshes(client, player, 'trackStart');
  await ensureAutoplayQueue(client, player, 'trackStart');
});

lavalink.on('trackEnd', async (player, track, reason) => {
  logger.debug(`trackEnd: reason=${reason} guild=${player.guildId}`);
  schedulePanelRefreshes(client, player, 'trackEnd');
});

  lavalink.on('queueEnd', async (player) => {
    const state = hestiaMusic.guildState.get(player.guildId);
    if (!state.autoplay) {
      logger.info(`Cola finalizada en guild ${player.guildId}`);
      state.currentTrackInfo = null;
      await hestiaMusic.deletePlayerMessage(client, player.guildId).catch(() => {});
      return;
    }
    await ensureAutoplayQueue(client, player, 'queueEnd');
  });

  lavalink.nodeManager.on('connect', () => logger.info('Lavalink conectado'));
  lavalink.nodeManager.on('error', (_node, error) => logger.error('Lavalink error', error?.message ?? error));
  lavalink.nodeManager.on('disconnect', () => logger.warn('Lavalink desconectado'));

  // Expose autoplay top-up for command/button toggles.
  lavalink.ensureAutoplayQueue = async (player, reason = 'manualToggle', options = {}) => {
    if (!player) return;
    await ensureAutoplayQueue(client, player, reason, options);
  };

  lavalink.bumpAutoplayGeneration = (guildId) => {
    const state = hestiaMusic.guildState.get(guildId);
    state.autoplayGeneration += 1;
    logger.info(`Autoplay: bump generation guild=${guildId} gen=${state.autoplayGeneration}`);
    return state.autoplayGeneration;
  };

  return lavalink;
}
