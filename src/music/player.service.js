import env from '../config/env.js';

function getOrCreatePlayer(client, guildId, voiceChannelId, textChannelId) {
  let player = client.lavalink.getPlayer(guildId);
  if (!player) {
    player = client.lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf: true,
      selfMute: false,
      volume: env.defaultVolume,
    });
  }

  if (!player.connected) player.connect();
  return player;
}

function getPlayer(client, guildId) {
  return client.lavalink.getPlayer(guildId);
}

export default { getOrCreatePlayer, getPlayer };
