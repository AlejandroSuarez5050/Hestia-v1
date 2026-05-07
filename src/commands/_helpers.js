import messages from '../core/messages.js';

export function requirePlayer(client, interaction, hestiaMusic) {
  const player = hestiaMusic.playerService.getPlayer(client, interaction.guild.id);
  if (!player) {
    const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    interaction[method]({ content: messages.nothingPlaying, ephemeral: true }).catch(() => {});
    return null;
  }
  return player;
}

export function requireSameVoice(interaction, player) {
  const voice = interaction.member.voice.channel;
  if (!voice) return messages.notInVoice;
  if (player.voiceChannelId && player.voiceChannelId !== voice.id) return messages.sameVoiceRequired;
  return null;
}
