const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback = false) => {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
};

const env = {
  token: process.env.TOKEN ?? '',
  appId: process.env.APP_ID ?? '',
  guildId: process.env.GUILD_ID ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  healthPort: toInt(process.env.HEALTH_PORT, 8080),
  defaultVolume: toInt(process.env.DEFAULT_VOLUME, 80),
  defaultSearchPlatform: process.env.DEFAULT_SEARCH_PLATFORM ?? 'ytmsearch',
  queueEmptyDestroyMs: toInt(process.env.QUEUE_EMPTY_DESTROY_MS, 30000),
  emptyChannelDestroyMs: toInt(process.env.EMPTY_CHANNEL_DESTROY_MS, 60000),
  autoplayDefault: toBool(process.env.AUTOPLAY_DEFAULT, false),
  autoplayBatchSize: toInt(process.env.AUTOPLAY_BATCH_SIZE, 5),
  autoplayHistorySize: toInt(process.env.AUTOPLAY_HISTORY_SIZE, 50),
  autoplayMaxSameArtistPerBatch: toInt(process.env.AUTOPLAY_MAX_SAME_ARTIST_PER_BATCH, 2),
  modoVerboseUi: toBool(process.env.MODO_VERBOSE_UI, false),
  playlistMaxTracks: toInt(process.env.PLAYLIST_MAX_TRACKS, 1000),
  spotifyFallbackInitialBatch: toInt(process.env.SPOTIFY_FALLBACK_INITIAL_BATCH, 25),
  spotifyFallbackSearchConcurrency: toInt(process.env.SPOTIFY_FALLBACK_SEARCH_CONCURRENCY, 10),
  spotifyEnabled: toBool(process.env.SPOTIFY_ENABLED, false),
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:9876/callback',
  spotifyRefreshToken: process.env.SPOTIFY_REFRESH_TOKEN ?? '',
  lavalink: {
    host: process.env.LAVALINK_HOST ?? 'lavalink',
    port: toInt(process.env.LAVALINK_PORT, 2333),
    password: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
  },
};

export default env;
