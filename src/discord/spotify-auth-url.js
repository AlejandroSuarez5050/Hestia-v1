import 'dotenv/config';
import env from '../config/env.js';

function main() {
  if (!env.spotifyClientId) {
    throw new Error('SPOTIFY_CLIENT_ID no configurado en .env');
  }

  const scopes = [
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: env.spotifyClientId,
    response_type: 'code',
    redirect_uri: env.spotifyRedirectUri,
    scope: scopes,
    show_dialog: 'true',
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log('\nAbre esta URL en tu navegador y autoriza la app:\n');
  console.log(url);
  console.log('\nLuego copia el parametro code del redirect y ejecuta:');
  console.log('npm run spotify:auth:exchange -- <CODE>');
}

main();
