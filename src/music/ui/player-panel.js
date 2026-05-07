import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder} from 'discord.js';

export function buildPlayerPanel(player, autoplayEnabled, currentTrackInfo = null) {
  const queueTrack = player.queue.current;
  const trackInfo = currentTrackInfo ?? queueTrack?.info ?? null;
  if (!trackInfo) return null;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Hestia Reproductor')
    .setDescription(`[${trackInfo?.title ?? 'Desconocido'}](${trackInfo?.uri ?? '#'})`)
    .addFields(
      { name: 'Artista', value: trackInfo?.author ?? 'Desconocido', inline: true },
      { name: 'Volumen', value: `${player.volume}%`, inline: true },
      { name: 'Cola', value: `${player.queue.tracks.length}`, inline: true }
    )
    .setFooter({ text: autoplayEnabled ? 'Autoplay activo' : 'Autoplay inactivo' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('player:back').setStyle(ButtonStyle.Secondary).setEmoji('⏮️'),
    new ButtonBuilder().setCustomId('player:pause').setStyle(ButtonStyle.Primary).setEmoji(player.paused ? '▶️' : '⏸️'),
    new ButtonBuilder().setCustomId('player:skip').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
    new ButtonBuilder().setCustomId('player:stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
    new ButtonBuilder().setCustomId('player:queue').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  const loopMode = player.repeatMode || 'off';
  const loopLabel = loopMode === 'track' ? 'Bucle: Pista' : loopMode === 'queue' ? 'Bucle: Cola' : 'Bucle: OFF';
  const loopStyle = loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success;

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('player:autoplay').setStyle(autoplayEnabled ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(autoplayEnabled ? 'Autoplay: ON' : 'Autoplay: OFF'),
    new ButtonBuilder().setCustomId('player:loop').setStyle(loopStyle).setLabel(loopLabel)
  );

  return { embeds: [embed], components: [row1, row2] };
}
