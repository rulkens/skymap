/**
 * parseSpacecraftTracks — read `spacecraftTracks.bin` (layout in `writeSpacecraftTracks`). The
 * tracks are views into `buf`, not copies: the writer 8-aligns every f64 column, which is what
 * lets `Float64Array` view them in place.
 */
import type { SampledTrack } from '../../@types/scene/SampledTrack';

const align = (n: number, to: number): number => Math.ceil(n / to) * to;

export function parseSpacecraftTracks(buf: ArrayBuffer): SampledTrack[] {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'SCTK') throw new Error(`parseSpacecraftTracks: bad magic "${magic}"`);
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`parseSpacecraftTracks: unsupported version ${version}`);

  const count = view.getUint32(8, true);
  const table: { id: string; n: number }[] = [];
  let at = 12;
  for (let k = 0; k < count; k++) {
    const idLen = view.getUint32(at, true);
    const id = new TextDecoder().decode(new Uint8Array(buf, at + 4, idLen));
    at += 4 + align(idLen, 4);
    table.push({ id, n: view.getUint32(at, true) });
    at += 4;
  }

  at = align(at, 8);
  return table.map(({ id, n }) => {
    const track: SampledTrack = {
      id,
      tDays: new Float64Array(buf, at, n),
      posKm: new Float64Array(buf, at + 8 * n, 3 * n),
      velKmS: new Float32Array(buf, at + 32 * n, 3 * n),
    };
    at += align(44 * n, 8);
    return track;
  });
}
