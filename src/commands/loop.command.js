import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('loop').setDescription('Cambia modo de bucle'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });

    const mode = player.repeatMode || 'off';
    if (mode === 'off') {
      player.setRepeatMode('track');
    } else if (mode === 'track') {
      player.setRepeatMode('queue');
    } else {
      player.setRepeatMode('off');
    }
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    await interaction.deleteReply().catch(() => {});
  },
};
