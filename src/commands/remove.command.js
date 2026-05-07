import {SlashCommandBuilder} from 'discord.js';
import messages from '../core/messages.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Elimina una pista de la cola')
    .addIntegerOption((o) => o.setName('position').setDescription('Posicion en cola').setRequired(true).setMinValue(1)),
  async execute({ client, interaction, hestiaMusic }) {
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    const pos = interaction.options.getInteger('position', true);
    const track = hestiaMusic.queueService.remove(player, pos);
    if (!track) return interaction.reply({ content: messages.invalidPosition, ephemeral: true });
    return interaction.reply({ content: messages.removedTrack(track.info?.title ?? 'Desconocido', pos), ephemeral: true });
  },
};
