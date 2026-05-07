import env from '../config/env.js';

function normalizePos(position) {
  return Number.parseInt(position, 10);
}

function append(player, tracks) {
  player.queue.add(tracks);
}

function prepend(player, tracks) {
  player.queue.add(tracks, 0);
}

function clear(player) {
  player.queue.tracks.splice(0, player.queue.tracks.length);
}

function shuffle(player) {
  player.queue.shuffle();
}

function remove(player, position) {
  const pos = normalizePos(position);
  const idx = pos - 1;
  if (!Number.isInteger(pos) || pos < 1 || idx >= player.queue.tracks.length) return null;
  return player.queue.tracks.splice(idx, 1)[0] ?? null;
}

function move(player, from, to) {
  const a = normalizePos(from);
  const b = normalizePos(to);
  const ai = a - 1;
  const bi = b - 1;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || ai >= player.queue.tracks.length || bi >= player.queue.tracks.length) return null;
  if (ai === bi) return { unchanged: true, track: player.queue.tracks[ai], from: a, to: b };
  const [track] = player.queue.tracks.splice(ai, 1);
  player.queue.tracks.splice(bi, 0, track);
  return { unchanged: false, track, from: a, to: b };
}

function jump(player, position) {
  const pos = normalizePos(position);
  const idx = pos - 1;
  if (!Number.isInteger(pos) || pos < 1 || idx >= player.queue.tracks.length) return null;
  const track = player.queue.tracks[idx];
  player.queue.tracks.splice(0, idx);
  return track;
}

function playNow(player, position) {
  const pos = normalizePos(position);
  const idx = pos - 1;
  if (!Number.isInteger(pos) || pos < 1 || idx >= player.queue.tracks.length) return null;
  const [track] = player.queue.tracks.splice(idx, 1);
  player.queue.add(track, 0);
  return track;
}

function playNext(player, position) {
  const pos = normalizePos(position);
  const idx = pos - 1;
  if (!Number.isInteger(pos) || pos < 1 || idx >= player.queue.tracks.length) return null;
  if (idx === 0) return { unchanged: true, track: player.queue.tracks[0], from: pos };
  const [track] = player.queue.tracks.splice(idx, 1);
  player.queue.tracks.splice(0, 0, track);
  return { unchanged: false, track, from: pos };
}

function page(player, pageNumber = 1, perPage = 10) {
  const tracks = player.queue.tracks;
  const total = tracks.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, pageNumber), totalPages);
  const start = (page - 1) * perPage;
  const items = tracks.slice(start, start + perPage);
  return { total, totalPages, page, start, items };
}

function capPlaylist(tracks) {
  return tracks.slice(0, env.playlistMaxTracks);
}

export default { append, prepend, clear, shuffle, remove, move, jump, playNow, playNext, page, capPlaylist };
