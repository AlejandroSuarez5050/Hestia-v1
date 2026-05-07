import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('stop').setDescription('Detiene la reproduccion y desconecta'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });
    hestiaMusic.queueService.clear(player);
    await player.destroy();
    await hestiaMusic.deletePlayerMessage(client, interaction.guild.id).catch(() => {});
    hestiaMusic.guildState.clear(interaction.guild.id);
    await interaction.deleteReply().catch(() => {});
  },
};
