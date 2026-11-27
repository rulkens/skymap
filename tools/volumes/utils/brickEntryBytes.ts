import { gzipSync } from 'node:zlib';

/** What the pack stores for one brick: nothing when every r8 code is 0 (the runtime writes the
 *  zero block), else one gzip member of the format's bytes, which the runtime inflates alone. */
export function brickEntryBytes(r8Brick: Uint8Array, formatBrick: Uint8Array): Uint8Array {
  return r8Brick.some((code) => code !== 0)
    ? gzipSync(formatBrick, { level: 9 })
    : new Uint8Array(0);
}
