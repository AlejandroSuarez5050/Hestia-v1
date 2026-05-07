import {SlashCommandBuilder} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una cancion o playlist.')
    .addStringOption((o) => o.setName('query').setDescription('URL o busqueda').setRequired(true).setMaxLength(500))
    .addBooleanOption((o) => o.setName('next').setDescription('Reproducir a continuacion').setRequired(false)),
  async execute({ client, interaction, hestiaMusic }) {
    const query = interaction.options.getString('query', true);
    const next = interaction.options.getBoolean('next') ?? false;
    await hestiaMusic.play({ client, interaction, query, playNext: next });
  },
};
