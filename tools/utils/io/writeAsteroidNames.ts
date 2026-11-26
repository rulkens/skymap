/**
 * writeAsteroidNames — the `asteroid-names.bin` layout (little-endian): u32 count, u32 numbers[count]
 * ascending, u32 offsets[count + 1] into a UTF-8 blob, then the blob. Only named asteroids go in; the
 * Layer binary-searches `numbers`, so the order is part of the format.
 */
export function writeAsteroidNames(
  entries: readonly { readonly number: number; readonly name: string }[],
): Uint8Array {
  const count = entries.length;
  const names = entries.map(({ name }) => new TextEncoder().encode(name));
  const blobAt = 4 + 4 * count + 4 * (count + 1);
  const bytes = new Uint8Array(blobAt + names.reduce((sum, s) => sum + s.length, 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, count, true);
  let at = 0;
  entries.forEach(({ number }, k) => {
    if (k > 0 && number <= entries[k - 1]!.number) {
      throw new Error(`writeAsteroidNames: (${number}) is out of order`);
    }
    view.setUint32(4 + 4 * k, number, true);
    view.setUint32(4 + 4 * count + 4 * k, at, true);
    bytes.set(names[k]!, blobAt + at);
    at += names[k]!.length;
  });
  view.setUint32(4 + 4 * count + 4 * count, at, true);
  return bytes;
}
