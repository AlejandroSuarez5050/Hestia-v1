import {SlashCommandBuilder} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Limpia mensajes del bot en este canal')
    .addStringOption((opt) => opt
      .setName('modo')
      .setDescription('Que limpiar')
      .addChoices(
        { name: 'panel', value: 'panel' },
        { name: 'canal', value: 'canal' },
      ))
    .addIntegerOption((opt) => opt
      .setName('limite')
      .setDescription('Max mensajes recientes a revisar (solo modo canal, 1-1000)')
      .setMinValue(1)
      .setMaxValue(1000))
    .addBooleanOption((opt) => opt
      .setName('profundo')
      .setDescription('Si true, hace multiples pasadas para limpiar mas mensajes')),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });

    const mode = interaction.options.getString('modo') ?? 'canal';
    if (mode === 'panel') {
      await hestiaMusic.deletePlayerMessage(client, interaction.guild.id).catch(() => false);
      await interaction.deleteReply().catch(() => {});
      return;
    }

    const limit = interaction.options.getInteger('limite') ?? 200;
    const deep = interaction.options.getBoolean('profundo') ?? false;
    await hestiaMusic.cleanupBotMessagesInChannel(client, interaction.guild.id, interaction.channel.id, limit, deep).catch(() => 0);
    await interaction.deleteReply().catch(() => {});
  },
};
