import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('skip').setDescription('Salta la pista actual'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });
    await player.skip();
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    await interaction.deleteReply().catch(() => {});
  },
};
