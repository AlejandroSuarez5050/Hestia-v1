import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('back').setDescription('Vuelve a la pista anterior'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });

    if (!player.queue.previous?.length) return interaction.editReply({ content: 'No hay pista anterior.' });
    const prev = await player.queue.shiftPrevious();
    if (player.queue.current) player.queue.add(player.queue.current, 0);
    await player.play({ clientTrack: prev });
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    await interaction.deleteReply().catch(() => {});
  },
};
