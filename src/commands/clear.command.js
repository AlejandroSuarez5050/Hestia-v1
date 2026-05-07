import {SlashCommandBuilder} from 'discord.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder().setName('clear').setDescription('Alias para limpiar la cola'),
  async execute({ client, interaction, hestiaMusic }) {
    await interaction.deferReply({ ephemeral: true });
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;
    const err = requireSameVoice(interaction, player);
    if (err) return interaction.editReply({ content: err });
    hestiaMusic.queueService.clear(player);
    const state = hestiaMusic.guildState.get(interaction.guild.id);
    if (state.autoplay) {
      const generation = client.lavalink?.bumpAutoplayGeneration?.(interaction.guild.id);
      await client.lavalink?.ensureAutoplayQueue?.(player, 'clearCommand', { force: true, generation });
    }
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    await interaction.deleteReply().catch(() => {});
  },
};
