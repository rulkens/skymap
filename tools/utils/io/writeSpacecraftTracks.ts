/**
 * writeSpacecraftTracks — serialise tracks to the `spacecraftTracks.bin` layout:
 * `SCTK`, u32 version 1, u32 track count, a table of (u32 idLen, UTF-8 id padded to 4, u32 n),
 * then, from the next 8-byte boundary, each track's f64 tDays, f64 posKm (3n), f32 velKmS (3n),
 * the block padded to 8 so every f64 column stays 8-aligned for typed-array views.
 * `parseSpacecraftTracks` is the reader.
 */
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';

const align = (n: number, to: number): number => Math.ceil(n / to) * to;

export function writeSpacecraftTracks(tracks: readonly SampledTrack[]): Uint8Array {
  const ids = tracks.map((t) => new TextEncoder().encode(t.id));
  let tableEnd = 12;
  for (const id of ids) tableEnd += 4 + align(id.length, 4) + 4;
  let size = align(tableEnd, 8);
  for (const t of tracks) size += align(t.tDays.length * (8 + 24 + 12), 8);

  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x53, 0x43, 0x54, 0x4b]); // 'SCTK'
  view.setUint32(4, 1, true);
  view.setUint32(8, tracks.length, true);
  let at = 12;
  tracks.forEach((t, k) => {
    view.setUint32(at, ids[k]!.length, true);
    bytes.set(ids[k]!, at + 4);
    at += 4 + align(ids[k]!.length, 4);
    view.setUint32(at, t.tDays.length, true);
    at += 4;
  });
  at = align(tableEnd, 8);
  for (const t of tracks) {
    const n = t.tDays.length;
    new Float64Array(bytes.buffer, at, n).set(t.tDays);
    new Float64Array(bytes.buffer, at + 8 * n, 3 * n).set(t.posKm);
    new Float32Array(bytes.buffer, at + 32 * n, 3 * n).set(t.velKmS);
    at += align(44 * n, 8);
  }
  return bytes;
}
