import {SlashCommandBuilder} from 'discord.js';
import messages from '../core/messages.js';
import {requirePlayer, requireSameVoice} from './_helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Gestion de cola')
    .addSubcommand((s) => s.setName('show').setDescription('Muestra la cola'))
    .addSubcommand((s) => s.setName('clear').setDescription('Limpia la cola')),
  async execute({ client, interaction, hestiaMusic }) {
    const sub = interaction.options.getSubcommand();
    const player = requirePlayer(client, interaction, hestiaMusic);
    if (!player) return;

    if (sub === 'show') {
      return interaction.reply(hestiaMusic.getQueueView(client, interaction.guild.id, 1));
    }

    const voiceErr = requireSameVoice(interaction, player);
    if (voiceErr) return interaction.reply({ content: voiceErr, ephemeral: true });
    hestiaMusic.queueService.clear(player);
    const state = hestiaMusic.guildState.get(interaction.guild.id);
    if (state.autoplay) {
      const generation = client.lavalink?.bumpAutoplayGeneration?.(interaction.guild.id);
      await client.lavalink?.ensureAutoplayQueue?.(player, 'queueClearCommand', { force: true, generation });
    }
    await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
    return interaction.reply({ content: messages.queueCleared, ephemeral: true });
  },
};
