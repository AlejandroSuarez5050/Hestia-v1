import {SlashCommandBuilder} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Busca y anade una pista rapidamente')
    .addStringOption((o) => o.setName('query').setDescription('Texto de busqueda').setRequired(true).setMaxLength(500)),
  async execute({ client, interaction, hestiaMusic }) {
    const query = interaction.options.getString('query', true);
    await hestiaMusic.play({ client, interaction, query, playNext: false });
  },
};
