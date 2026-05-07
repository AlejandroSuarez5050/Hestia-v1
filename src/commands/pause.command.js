import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pausa o reanuda reproduccion'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });
    if (player.paused) {
      await player.resume();
    } else {
      await player.pause();
    }
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    await interaction.deleteReply().catch(() => {});
  },
};
