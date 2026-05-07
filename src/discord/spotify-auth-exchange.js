import 'dotenv/config';
import env from '../config/env.js';

async function main() {
  const code = process.argv[2];
  if (!code) {
    throw new Error('Debes pasar el CODE: npm run spotify:auth:exchange -- <CODE>');
  }
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET no configurados.');
  }

  const basic = Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.spotifyRedirectUri,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`No se pudo intercambiar code: ${res.status} ${JSON.stringify(data)}`);
  }

  if (!data.refresh_token) {
    throw new Error('Spotify no devolvio refresh_token. Intenta con show_dialog=true y nueva autorizacion.');
  }

  console.log('\nCopia este valor en tu .env:');
  console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
