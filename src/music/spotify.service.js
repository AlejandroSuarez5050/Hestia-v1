import env from '../config/env.js';
import logger from '../core/logger.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const tokenCache = {
  user: { accessToken: null, expiresAt: 0 },
  profile: { data: null, expiresAt: 0 },
};

function getBasicAuth() {
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    logger.warn('Spotify fallback: faltan credenciales de Spotify en el bot');
    throw new Error('spotify_missing_credentials');
  }
  return Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString('base64');
}

function isSpotifyPlaylistUrl(query) {
  return /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/|spotify:playlist:)/i.test(String(query ?? ''));
}

function isSpotifyAlbumUrl(query) {
  return /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/|spotify:album:)/i.test(String(query ?? ''));
}

function extractPlaylistId(query) {
  const raw = String(query ?? '').trim();
  const byUri = raw.match(/^spotify:playlist:([a-zA-Z0-9]+)$/i);
  if (byUri) return byUri[1];

  const byUrl = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/i);
  if (byUrl) return byUrl[1];
  return null;
}

function extractAlbumId(query) {
  const raw = String(query ?? '').trim();
  const byUri = raw.match(/^spotify:album:([a-zA-Z0-9]+)$/i);
  if (byUri) return byUri[1];

  const byUrl = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/i);
  if (byUrl) return byUrl[1];
  return null;
}

async function getUserAccessToken() {
  const now = Date.now();
  if (tokenCache.user.accessToken && now < tokenCache.user.expiresAt) {
    return tokenCache.user.accessToken;
  }

  if (!env.spotifyRefreshToken) {
    throw new Error('spotify_missing_refresh_token');
  }

  const basic = getBasicAuth();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: env.spotifyRefreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`spotify_refresh_error_${res.status}`);
  }

  const data = await res.json();
  tokenCache.user.accessToken = data.access_token;
  tokenCache.user.expiresAt = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
  logger.info('Spotify fallback: token user (refresh_token) obtenido');
  return tokenCache.user.accessToken;
}

async function spotifyApiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, body };
  }

  return { ok: true, data: await res.json() };
}

async function getCurrentUserProfile(token) {
  const now = Date.now();
  if (tokenCache.profile.data && now < tokenCache.profile.expiresAt) {
    return tokenCache.profile.data;
  }

  const result = await spotifyApiGet('https://api.spotify.com/v1/me', token);
  if (!result.ok) {
    logger.warn(`Spotify fallback: /me respondio ${result.status} body=${result.body}`);
    return null;
  }

  tokenCache.profile.data = result.data;
  tokenCache.profile.expiresAt = Date.now() + 10 * 60 * 1000;
  logger.info(`Spotify fallback: usuario OAuth id=${result.data?.id ?? 'unknown'} country=${result.data?.country ?? 'unknown'}`);
  return result.data;
}

function mapTrackItems(items, maxTracks) {
  const tracks = [];
  for (const item of items || []) {
    const track = item?.item ?? item?.track;
    if (track?.type && track.type !== 'track') continue;
    if (!track?.name) continue;
    const artist = track.artists?.map((a) => a.name).filter(Boolean).join(' ') || '';
    const isrc = track.external_ids?.isrc || '';
    tracks.push({ name: track.name, artist, isrc });
    if (tracks.length >= maxTracks) break;
  }
  return tracks;
}

async function findCurrentUserPlaylist(playlistId, token) {
  let offset = 0;
  const limit = 50;

  while (offset <= 100000) {
    const url = `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;
    const result = await spotifyApiGet(url, token);
    if (!result.ok) {
      logger.warn(`Spotify fallback: /me/playlists respondio ${result.status} body=${result.body}`);
      throw new Error(`spotify_user_playlists_error_${result.status}`);
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    const playlist = items.find((item) => item?.id === playlistId);
    if (playlist) return playlist;

    if (!result.data?.next || items.length === 0) break;
    offset += limit;
  }

  return null;
}

async function fetchPlaylistItems(playlistId, maxTracks, token, market) {
  const tracks = [];
  let offset = 0;
  const limit = 50;
  const fields = 'total,next,items(item(name,type,artists(name),external_ids(isrc)),track(name,type,artists(name),external_ids(isrc)))';
  const marketQuery = market ? `&market=${market}` : '';

  while (tracks.length < maxTracks) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${limit}&offset=${offset}&additional_types=track&fields=${encodeURIComponent(fields)}${marketQuery}`;
    const result = await spotifyApiGet(url, token);
    if (!result.ok) {
      logger.warn(`Spotify fallback: /playlists/${playlistId}/items respondio ${result.status} body=${result.body}`);
      if (result.status === 403) throw new Error('spotify_playlist_not_owner_or_collaborator');
      throw new Error(`spotify_playlist_items_error_${result.status}`);
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    tracks.push(...mapTrackItems(items, maxTracks - tracks.length));
    logger.info(`Spotify fallback: pagina items offset=${offset} items=${items.length} total=${result.data?.total ?? 'unknown'}`);

    if (!result.data?.next || items.length === 0) break;
    offset += limit;
  }

  return tracks;
}

async function fetchPlaylistItemsFromHref(baseHref, maxTracks, token, market) {
  if (!baseHref) return [];
  const tracks = [];
  let offset = 0;
  const limit = 50;

  while (tracks.length < maxTracks) {
    const url = new URL(baseHref);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    if (market) url.searchParams.set('market', market);

    const result = await spotifyApiGet(url.toString(), token);
    if (!result.ok) {
      logger.warn(`Spotify fallback: href tracks respondio ${result.status} body=${result.body}`);
      throw new Error(`spotify_playlist_href_error_${result.status}`);
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    tracks.push(...mapTrackItems(items, maxTracks - tracks.length));
    logger.info(`Spotify fallback: pagina href offset=${offset} items=${items.length} total=${result.data?.total ?? 'unknown'}`);

    if (!result.data?.next || items.length === 0) break;
    offset += limit;
  }

  return tracks;
}

async function fetchPlaylistTracks(playlistId, maxTracks) {
  const userToken = await getUserAccessToken();
  const profile = await getCurrentUserProfile(userToken);
  const playlist = await findCurrentUserPlaylist(playlistId, userToken);

  if (!playlist) {
    logger.warn(`Spotify fallback: playlist ${playlistId} no aparece en /me/playlists`);
    throw new Error('spotify_playlist_not_in_user_library');
  }

  logger.info(
    `Spotify fallback: playlist accesible id=${playlist.id} name=${playlist.name ?? 'unknown'} owner=${playlist.owner?.id ?? 'unknown'} public=${String(playlist.public)} collaborative=${String(playlist.collaborative)} total=${playlist.tracks?.total ?? 'unknown'}`,
  );

  const market = profile?.country || null;
  let tracks;
  try {
    tracks = await fetchPlaylistItems(playlistId, maxTracks, userToken, market);
  } catch (error) {
    if (String(error?.message || '').includes('spotify_playlist_not_owner_or_collaborator')) {
      const href = playlist?.items?.href || playlist?.tracks?.href || null;
      if (href) {
        logger.info('Spotify fallback: /items devolvio 403, intentando href legacy de /me/playlists');
        tracks = await fetchPlaylistItemsFromHref(href, maxTracks, userToken, market);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
  logger.info(`Spotify fallback: tracks extraidos desde /items = ${tracks.length}`);

  if (tracks.length === 0) {
    throw new Error('spotify_playlist_empty_or_forbidden');
  }

  return tracks;
}

async function fetchAlbumTracks(albumId, maxTracks) {
  const userToken = await getUserAccessToken();
  const profile = await getCurrentUserProfile(userToken);
  const market = profile?.country || null;
  const tracks = [];
  let offset = 0;
  const limit = 50;

  while (tracks.length < maxTracks) {
    const url = new URL(`https://api.spotify.com/v1/albums/${albumId}/tracks`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    if (market) url.searchParams.set('market', market);

    const result = await spotifyApiGet(url.toString(), userToken);
    if (!result.ok) {
      logger.warn(`Spotify fallback: /albums/${albumId}/tracks respondio ${result.status} body=${result.body}`);
      throw new Error(`spotify_album_error_${result.status}`);
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    const mapped = items
      .filter((track) => track?.name)
      .map((track) => ({
        name: track.name,
        artist: (track.artists || []).map((a) => a.name).filter(Boolean).join(' ') || '',
        isrc: '',
      }));
    tracks.push(...mapped.slice(0, maxTracks - tracks.length));

    if (!result.data?.next || items.length === 0) break;
    offset += limit;
  }

  if (!tracks.length) throw new Error('spotify_album_empty_or_forbidden');
  return tracks;
}

export default {
  extractAlbumId,
  extractPlaylistId,
  fetchAlbumTracks,
  fetchPlaylistTracks,
  isSpotifyAlbumUrl,
  isSpotifyPlaylistUrl,
};
