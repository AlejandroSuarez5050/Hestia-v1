import env from '../config/env.js';
import hestiaMusic from '../music/hestia-music.js';

const timers = new Map();

export default {
  name: 'voiceStateUpdate',
  async execute(client, oldState) {
    const guildId = oldState.guild.id;
    const player = hestiaMusic.playerService.getPlayer(client, guildId);
    if (!player || !player.voiceChannelId) return;

    const channel = oldState.guild.channels.cache.get(player.voiceChannelId);
    if (!channel) return;
    const humans = channel.members.filter((m) => !m.user.bot).size;

    if (humans > 0) {
      if (timers.has(guildId)) {
        clearTimeout(timers.get(guildId));
        timers.delete(guildId);
      }
      return;
    }

    if (timers.has(guildId)) return;
    timers.set(guildId, setTimeout(async () => {
      timers.delete(guildId);
      const freshPlayer = hestiaMusic.playerService.getPlayer(client, guildId);
      if (freshPlayer) {
        await freshPlayer.destroy().catch(() => {});
        hestiaMusic.guildState.clear(guildId);
      }
    }, env.emptyChannelDestroyMs));
  },
};
