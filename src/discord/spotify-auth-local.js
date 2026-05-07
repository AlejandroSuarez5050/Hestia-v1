import 'dotenv/config';
import http from 'http';
import env from '../config/env.js';

async function exchangeCodeForRefreshToken(code) {
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
    throw new Error(`Error intercambiando code: ${res.status} ${JSON.stringify(data)}`);
  }

  if (!data.refresh_token) {
    throw new Error('Spotify no devolvio refresh_token. Repite autorizacion con show_dialog=true.');
  }

  return data.refresh_token;
}

function buildAuthUrl() {
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

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function main() {
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    throw new Error('Configura SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en .env');
  }

  let redirect;
  try {
    redirect = new URL(env.spotifyRedirectUri);
  } catch {
    throw new Error('SPOTIFY_REDIRECT_URI invalido.');
  }

  if (!['127.0.0.1', 'localhost'].includes(redirect.hostname)) {
    throw new Error('SPOTIFY_REDIRECT_URI debe ser local para este flujo, por ejemplo http://127.0.0.1:9876/callback');
  }

  const port = Number.parseInt(redirect.port || '80', 10);
  const expectedPath = redirect.pathname || '/';

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `${redirect.protocol}//${redirect.host}`);
      if (reqUrl.pathname !== expectedPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Ruta no encontrada');
        return;
      }

      const error = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Spotify devolvio error: ${error}`);
        console.error(`Spotify devolvio error: ${error}`);
        server.close();
        process.exit(1);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No se recibio code en callback.');
        return;
      }

      const refreshToken = await exchangeCodeForRefreshToken(code);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Autorizacion completada. Ya puedes cerrar esta ventana.');

      console.log('\nSPOTIFY_REFRESH_TOKEN obtenido:');
      console.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
      console.log('\nPegalo en tu .env y reinicia el bot.');

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error procesando callback.');
      console.error(err?.message ?? err);
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, redirect.hostname, () => {
    console.log('Servidor de callback Spotify escuchando en:');
    console.log(`${redirect.protocol}//${redirect.host}${expectedPath}`);
    console.log('\nAbre esta URL para autorizar:');
    console.log(buildAuthUrl());
  });
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
