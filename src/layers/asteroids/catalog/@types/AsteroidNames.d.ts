/**
 * AsteroidNames — `asteroid-names.bin` as views onto the fetched buffer (layout in
 * `tools/utils/io/writeAsteroidNames.ts`): `numbers` ascending, name j is
 * `blob[offsets[j], offsets[j + 1])` in UTF-8.
 */
export type AsteroidNames = {
  readonly numbers: Uint32Array;
  readonly offsets: Uint32Array;
  readonly blob: Uint8Array;
};
