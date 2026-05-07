import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder} from 'discord.js';
import queueService from '../queue.service.js';

function truncate(text, max = 52) {
  if (!text) return 'Desconocido';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildQueuePanel(player, page = 1) {
  const data = queueService.page(player, page, 8);
  if (!data.items.length) {
    return { content: 'La cola esta vacia.', embeds: [], components: [], ephemeral: true };
  }

  const lines = data.items.map((track, i) => `${data.start + i + 1}. ${truncate(track.info?.title)} — ${truncate(track.info?.author, 24)}`);
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle(`Cola (${data.total})`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Pagina ${data.page}/${data.totalPages}` });

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`queue:prev:${data.page - 1}`).setStyle(ButtonStyle.Secondary).setEmoji('◀️').setDisabled(data.page === 1),
    new ButtonBuilder().setCustomId(`queue:next:${data.page + 1}`).setStyle(ButtonStyle.Secondary).setEmoji('▶️').setDisabled(data.page === data.totalPages),
    new ButtonBuilder().setCustomId('queue:player').setStyle(ButtonStyle.Secondary).setEmoji('🎛️').setLabel('Reproductor'),
    new ButtonBuilder().setCustomId('queue:shuffle').setStyle(ButtonStyle.Secondary).setLabel('Mezclar'),
    new ButtonBuilder().setCustomId('queue:clear').setStyle(ButtonStyle.Danger).setLabel('Limpiar')
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`queue:select:${data.page}`)
    .setPlaceholder('Selecciona pista para acciones')
    .addOptions(data.items.map((track, i) => ({
      label: `${data.start + i + 1}. ${truncate(track.info?.title, 70)}`,
      description: truncate(track.info?.author, 90),
      value: String(data.start + i + 1),
    })));

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`queue:action:jump:${data.page}`).setStyle(ButtonStyle.Primary).setLabel('Reproducir ahora'),
    new ButtonBuilder().setCustomId(`queue:action:next:${data.page}`).setStyle(ButtonStyle.Success).setLabel('Poner siguiente'),
    new ButtonBuilder().setCustomId(`queue:action:remove:${data.page}`).setStyle(ButtonStyle.Secondary).setLabel('Eliminar'),
    new ButtonBuilder().setCustomId(`queue:action:up:${data.page}`).setStyle(ButtonStyle.Secondary).setLabel('Subir'),
    new ButtonBuilder().setCustomId(`queue:action:down:${data.page}`).setStyle(ButtonStyle.Secondary).setLabel('Bajar')
  );

  return { embeds: [embed], components: [nav, new ActionRowBuilder().addComponents(select), actions], ephemeral: true };
}
