import queueService from './queue.service.js';
import env from '../config/env.js';
import logger from '../core/logger.js';

function sanitizeQuery(query) {
  return String(query ?? '').trim().replace(/[>\s]+$/, '');
}

function isSpotifyUrl(query) {
  return /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|playlist|album)\/|spotify:(?:track|playlist|album):)/i.test(query);
}

function isSpotifyPlaylistUrl(query) {
  return /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/|spotify:playlist:)/i.test(query);
}

function buildSpotifyFallbackQuery(query) {
  return query.startsWith('spsearch:') ? query : `spsearch:${query}`;
}

async function runSearch(player, query, user) {
  try {
    return await player.search({ query }, user);
  } catch (error) {
    logger.warn(`Busqueda fallo para query="${query}": ${error?.message ?? error}`);
    return null;
  }
}

async function resolve(player, query, user) {
  const cleanQuery = sanitizeQuery(query);
  const spotifyUrl = isSpotifyUrl(cleanQuery);

  if (spotifyUrl && !env.spotifyEnabled) {
    return { found: false, reason: 'spotify_disabled' };
  }

  let res = await runSearch(player, cleanQuery, user);

  // Spotify fallback: some Lavalink/LavaSrc setups require explicit spsearch prefix.
  if ((!res || !res.tracks?.length) && spotifyUrl) {
    res = await runSearch(player, buildSpotifyFallbackQuery(cleanQuery), user);
  }

  if (!res || !res.tracks?.length) {
    if (isSpotifyPlaylistUrl(cleanQuery)) {
      return { found: false, reason: 'spotify_playlist_forbidden' };
    }
    return { found: false };
  }

  const looksLikePlaylist =
    res.loadType === 'playlist'
    || (spotifyUrl && res.tracks.length > 1)
    || Boolean(res.playlist?.name || res.playlist?.title);

  if (looksLikePlaylist) {
    const tracks = queueService.capPlaylist(res.tracks);
    return {
      found: true,
      type: 'playlist',
      name: res.playlist?.title ?? res.playlist?.name ?? 'Playlist',
      tracks,
    };
  }

  return {
    found: true,
    type: 'track',
    track: res.tracks[0],
  };
}

async function resolvePlaylist(player, query, user) {
  const cleanQuery = sanitizeQuery(query);
  const spotifyUrl = isSpotifyUrl(cleanQuery);

  if (spotifyUrl && !env.spotifyEnabled) {
    return { found: false, reason: 'spotify_disabled' };
  }

  const attempts = [];
  if (spotifyUrl) {
    attempts.push(cleanQuery);
    attempts.push(buildSpotifyFallbackQuery(cleanQuery));
  } else {
    attempts.push(cleanQuery);
    attempts.push(`ytmsearch:${cleanQuery} playlist`);
    attempts.push(`ytsearch:${cleanQuery} playlist`);
  }

  for (const attempt of attempts) {
    const res = await runSearch(player, attempt, user);
    if (!res || !res.tracks?.length) continue;

    const looksLikePlaylist =
      res.loadType === 'playlist'
      || (spotifyUrl && res.tracks.length > 1)
      || Boolean(res.playlist?.name || res.playlist?.title)
      || res.tracks.length > 1;

    if (!looksLikePlaylist) continue;

    const tracks = queueService.capPlaylist(res.tracks);
    return {
      found: true,
      type: 'playlist',
      name: res.playlist?.title ?? res.playlist?.name ?? 'Playlist',
      tracks,
    };
  }

  if (isSpotifyPlaylistUrl(cleanQuery)) {
    return { found: false, reason: 'spotify_playlist_forbidden' };
  }

  return { found: false, reason: 'playlist_only_no_results' };
}

export default { resolve, resolvePlaylist };
