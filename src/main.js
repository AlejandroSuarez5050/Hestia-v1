import 'dotenv/config';
import http from 'http';
import env from './config/env.js';
import logger from './core/logger.js';
import {createClient} from './discord/client.js';
import {loadCommands} from './discord/command-loader.js';
import {loadEvents} from './discord/event-loader.js';
import {createLavalink} from './music/lavalink.service.js';

async function bootstrap() {
  if (!env.token) throw new Error('TOKEN no configurado en .env');

  const client = createClient();
  client.lavalink = createLavalink(client);

  client.on('raw', (packet) => client.lavalink.sendRawData(packet));

  await loadCommands(client);
  await loadEvents(client);
  await client.login(env.token);

  const healthServer = http.createServer((_req, res) => {
    const node = client.lavalink?.nodeManager?.nodes?.get('main-node');
    const payload = {
      ok: true,
      discordReady: Boolean(client.user),
      lavalinkConnected: Boolean(node?.connected),
      players: client.lavalink?.players?.size ?? 0,
      uptimeSec: Math.floor(process.uptime()),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  healthServer.listen(env.healthPort, '0.0.0.0');

  const shutdown = async () => {
    logger.info('Apagando Hestia...');
    for (const player of client.lavalink.players.values()) {
      await player.destroy().catch(() => {});
    }
    for (const node of client.lavalink.nodeManager.nodes.values()) {
      await node.destroy().catch(() => {});
    }
    healthServer.close();
    await client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  logger.error('Error al iniciar Hestia:', error?.message ?? error);
  process.exit(1);
});
