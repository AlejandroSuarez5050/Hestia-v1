import {SlashCommandBuilder} from 'discord.js';
import messages from '../core/messages.js';

export default {
  data: new SlashCommandBuilder().setName('autoplay').setDescription('Activa o desactiva autoplay'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.editReply({ content: messages.notInVoice });
    }
    
    const player = hestiaMusic.playerService.getPlayer(client, interaction.guild.id);
    if (player?.voiceChannelId && player.voiceChannelId !== voice.id) {
      return interaction.editReply({ content: messages.sameVoiceRequired });
    }
    
    const state = hestiaMusic.guildState.get(interaction.guild.id);
    state.autoplay = !state.autoplay;

    if (state.autoplay && player) {
      await client.lavalink?.ensureAutoplayQueue?.(player, 'commandToggleOn');
    }
    
    // Actualizar el panel del reproductor si existe
    if (player) {
      await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    }
    
    await interaction.deleteReply().catch(() => {});
  },
};
