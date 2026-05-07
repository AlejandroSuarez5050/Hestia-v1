import {SlashCommandBuilder} from 'discord.js';
import messages from '../core/messages.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Mueve una pista de la cola')
    .addIntegerOption((o) => o.setName('from').setDescription('Posicion origen').setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName('to').setDescription('Posicion destino').setRequired(true).setMinValue(1)),
  async execute({ client, interaction, hestiaMusic }) {
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    const result = hestiaMusic.queueService.move(player, from, to);
    if (!result) return interaction.reply({ content: messages.invalidPosition, ephemeral: true });
    if (result.unchanged) return interaction.reply({ content: messages.moveSame, ephemeral: true });
    return interaction.reply({ content: messages.movedTrack(result.track.info?.title ?? 'Desconocido', from, to), ephemeral: true });
  },
};
