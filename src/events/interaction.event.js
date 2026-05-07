import messages from '../core/messages.js';
import hestiaMusic from '../music/hestia-music.js';
import logger from '../core/logger.js';
import {buildPlayerPanel} from '../music/ui/player-panel.js';
import env from '../config/env.js';

function getPlayer(client, guildId) {
  return hestiaMusic.playerService.getPlayer(client, guildId);
}

function requireVoice(interaction, player) {
  const userChannel = interaction.member.voice.channel;
  if (!userChannel) return messages.notInVoice;
  if (player && player.voiceChannelId && userChannel.id !== player.voiceChannelId) return messages.sameVoiceRequired;
  return null;
}

function getPlayerView(interaction, player) {
  const state = hestiaMusic.guildState.get(interaction.guild.id);
  const built = buildPlayerPanel(player, state.autoplay, state.currentTrackInfo);
  return built ?? { content: messages.nothingPlaying, embeds: [], components: [] };
}

function isUnknownInteractionError(error) {
  return error?.code === 10062 || String(error?.message ?? '').toLowerCase().includes('unknown interaction');
}

async function safeInteractionCall(interaction, method, payload) {
  try {
    return await interaction[method](payload);
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      logger.warn(`Interaccion expirada en ${method}; se omite respuesta (${interaction.customId ?? interaction.commandName ?? 'unknown'})`);
      return null;
    }
    throw error;
  }
}

async function maybeVerboseFollowUp(interaction, content) {
  if (!env.modoVerboseUi) return;
  await safeInteractionCall(interaction, 'followUp', { content, ephemeral: true });
}

async function transientChannelNotice(interaction, content, ttlMs = 5000) {
  const channel = interaction.channel;
  if (!channel?.send) return;
  const msg = await channel.send({ content }).catch(() => null);
  if (!msg) return;
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, Math.max(1000, ttlMs));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  name: 'interactionCreate',
  async execute(client, interaction) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute({ client, interaction, hestiaMusic });
      } catch (error) {
        logger.error(`Error en comando /${interaction.commandName}:`, error?.message ?? error);
        const method = interaction.deferred || interaction.replied ? 'followUp' : 'reply';
        await interaction[method]({ content: messages.genericError, ephemeral: true }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        const [scope, action, arg, extra] = interaction.customId.split(':');
        const player = getPlayer(client, interaction.guild.id);
        if (!player) {
          return safeInteractionCall(interaction, 'reply', { content: messages.nothingPlaying, ephemeral: true });
        }
        const voiceError = requireVoice(interaction, player);
        if (voiceError) return safeInteractionCall(interaction, 'reply', { content: voiceError, ephemeral: true });

        if (scope === 'player') {
          if (action === 'pause') {
            if (player.paused) await player.resume(); else await player.pause();
            await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
            await maybeVerboseFollowUp(interaction, player.paused ? messages.paused : messages.resumed);
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          } else if (action === 'skip') {
            if (!player.queue.tracks?.length) {
              await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
              await transientChannelNotice(interaction, messages.queueEmpty, 5000);
              return;
            }
            try {
              await player.skip();
            } catch (error) {
              logger.warn(`Skip fallo en guild ${interaction.guild.id}: ${error?.message ?? error}`);
            }
            await sleep(400);
            await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
            await maybeVerboseFollowUp(interaction, messages.skipped);
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          } else if (action === 'stop') {
            hestiaMusic.queueService.clear(player);
            await player.destroy();
            await hestiaMusic.deletePlayerMessage(client, interaction.guild.id).catch(() => {});
            hestiaMusic.guildState.clear(interaction.guild.id);
            await safeInteractionCall(interaction, 'update', { content: messages.stopped, embeds: [], components: [] });
          } else if (action === 'back') {
            if (player.queue.previous?.length) {
              const prev = await player.queue.shiftPrevious();
              if (player.queue.current) player.queue.add(player.queue.current, 0);
              await player.play({ clientTrack: prev });
              await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
              await maybeVerboseFollowUp(interaction, `Volviendo a **${prev.info?.title ?? 'Desconocido'}**`);
              await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
            } else {
              await safeInteractionCall(interaction, 'reply', { content: 'No hay pista anterior.', ephemeral: true });
            }
          } else if (action === 'autoplay') {
            const state = hestiaMusic.guildState.get(interaction.guild.id);
            state.autoplay = !state.autoplay;
            if (state.autoplay && player) {
              await client.lavalink?.ensureAutoplayQueue?.(player, 'buttonToggleOn');
            }
            await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
            await maybeVerboseFollowUp(interaction, state.autoplay ? messages.autoplayOn : messages.autoplayOff);
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          } else if (action === 'loop') {
            const mode = player.repeatMode || 'off';
            if (mode === 'off') player.setRepeatMode('track');
            else if (mode === 'track') player.setRepeatMode('queue');
            else player.setRepeatMode('off');
            await safeInteractionCall(interaction, 'update', getPlayerView(interaction, player));
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          } else if (action === 'queue') {
            await safeInteractionCall(interaction, 'reply', hestiaMusic.getQueueView(client, interaction.guild.id, 1));
          }
        }

        if (scope === 'queue') {
        if (action === 'prev' || action === 'next') {
          const target = Number.parseInt(arg, 10) || 1;
          await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, target));
          return;
        }
        if (action === 'player') {
          const statePlayer = getPlayer(client, interaction.guild.id);
          if (!statePlayer?.queue.current) {
            await safeInteractionCall(interaction, 'reply', { content: messages.nothingPlaying, ephemeral: true });
            return;
          }
          await safeInteractionCall(interaction, 'deferUpdate');
          await safeInteractionCall(interaction, 'deleteReply');
          await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          return;
        }
        if (action === 'shuffle') {
          hestiaMusic.queueService.shuffle(player);
          await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, 1));
          await maybeVerboseFollowUp(interaction, messages.queueShuffled);
          return;
        }
        if (action === 'clear') {
          await safeInteractionCall(interaction, 'deferUpdate');
          const state = hestiaMusic.guildState.get(interaction.guild.id);

          if (state.queueClearInProgress) {
            await safeInteractionCall(interaction, 'editReply', { content: 'Recargando cola...', embeds: [], components: [] });
            return;
          }

          state.queueClearInProgress = true;
          hestiaMusic.queueService.clear(player);

          if (state.autoplay) {
            const generation = client.lavalink?.bumpAutoplayGeneration?.(interaction.guild.id);
            try {
              await safeInteractionCall(interaction, 'editReply', { content: 'Recargando autoplay...', embeds: [], components: [] });
              await client.lavalink?.ensureAutoplayQueue?.(player, 'queueClearButton', { force: true, generation });
              await safeInteractionCall(interaction, 'editReply', hestiaMusic.getQueueView(client, interaction.guild.id, 1));
              await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
            } catch (error) {
              logger.warn(`queue:clear autoplay refill fallo: ${error?.message ?? error}`);
              await safeInteractionCall(interaction, 'editReply', hestiaMusic.getQueueView(client, interaction.guild.id, 1));
            } finally {
              state.queueClearInProgress = false;
            }
          } else {
            await safeInteractionCall(interaction, 'editReply', hestiaMusic.getQueueView(client, interaction.guild.id, 1));
            state.queueClearInProgress = false;
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel).catch(() => {});
          }
          return;
        }
        if (action === 'action') {
          const currentPage = Number.parseInt(extra, 10) || 1;
          const selected = hestiaMusic.getSelection(interaction.guild.id);
          if (!selected) {
            await safeInteractionCall(interaction, 'reply', { content: 'Primero selecciona una pista en el menu.', ephemeral: true });
            return;
          }

          if (arg === 'jump') {
            const track = hestiaMusic.queueService.playNow(player, selected);
            if (!track) return safeInteractionCall(interaction, 'reply', { content: messages.invalidPosition, ephemeral: true });
            await player.skip();
            await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, currentPage));
            await maybeVerboseFollowUp(interaction, messages.jumpedTrack(track.info?.title ?? 'Desconocido'));
          } else if (arg === 'next') {
            const res = hestiaMusic.queueService.playNext(player, selected);
            if (!res) return safeInteractionCall(interaction, 'reply', { content: messages.invalidPosition, ephemeral: true });
            await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, currentPage));
            if (!res.unchanged) {
              hestiaMusic.selectQueueTrack(interaction.guild.id, 1);
              await maybeVerboseFollowUp(interaction, messages.movedTrackNext(res.track.info?.title ?? 'Desconocido', res.from));
            } else {
              await maybeVerboseFollowUp(interaction, messages.moveSame);
            }
          } else if (arg === 'remove') {
            const t = hestiaMusic.queueService.remove(player, selected);
            if (!t) return safeInteractionCall(interaction, 'reply', { content: messages.invalidPosition, ephemeral: true });
            await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, currentPage));
            await maybeVerboseFollowUp(interaction, messages.removedTrack(t.info?.title ?? 'Desconocido', selected));
          } else if (arg === 'up' || arg === 'down') {
            const to = arg === 'up' ? selected - 1 : selected + 1;
            const res = hestiaMusic.queueService.move(player, selected, to);
            if (!res) return safeInteractionCall(interaction, 'reply', { content: messages.invalidPosition, ephemeral: true });
            if (res.unchanged) return safeInteractionCall(interaction, 'reply', { content: messages.moveSame, ephemeral: true });
            await safeInteractionCall(interaction, 'update', hestiaMusic.getQueueView(client, interaction.guild.id, currentPage));
            await maybeVerboseFollowUp(interaction, messages.movedTrack(res.track.info?.title ?? 'Desconocido', res.from, res.to));
            hestiaMusic.selectQueueTrack(interaction.guild.id, res.to);
          }

          const state = hestiaMusic.guildState.get(interaction.guild.id);
          if (state.playerMessage) {
            await hestiaMusic.upsertPlayerMessage(client, interaction.guild.id, interaction.channel);
          }
        }
        }
      } catch (error) {
        if (isUnknownInteractionError(error)) {
          logger.warn(`Interaccion expirada en boton (${interaction.customId})`);
          return;
        }
        logger.error('Error manejando boton:', error?.message ?? error);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const [scope, action] = interaction.customId.split(':');
      if (scope === 'queue' && action === 'select') {
        const pos = Number.parseInt(interaction.values[0], 10);
        hestiaMusic.selectQueueTrack(interaction.guild.id, pos);
        if (env.modoVerboseUi) {
          await safeInteractionCall(interaction, 'reply', { content: `Seleccionada posicion **${pos}** para acciones de cola.`, ephemeral: true });
        } else {
          await safeInteractionCall(interaction, 'deferUpdate');
        }
      }
    }
  },
};
