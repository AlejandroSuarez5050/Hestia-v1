import logger from '../core/logger.js';

export default {
  name: 'clientReady',
  once: true,
  async execute(client) {
    client.lavalink.init({
      id: client.user.id,
      username: client.user.username,
    });
    logger.info(`Bot conectado como ${client.user.tag}`);
  },
};
