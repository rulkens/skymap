import type { AsteroidNames } from '../@types/AsteroidNames';

/** parseAsteroidNames — `asteroid-names.bin` as views, no copy; names decode one at a time on read. */
export function parseAsteroidNames(buf: ArrayBuffer): AsteroidNames {
  const count = new DataView(buf).getUint32(0, true);
  const blobAt = 4 + 4 * count + 4 * (count + 1);
  if (blobAt > buf.byteLength) throw new Error('parseAsteroidNames: truncated');
  return {
    numbers: new Uint32Array(buf, 4, count),
    offsets: new Uint32Array(buf, 4 + 4 * count, count + 1),
    blob: new Uint8Array(buf, blobAt),
  };
}
