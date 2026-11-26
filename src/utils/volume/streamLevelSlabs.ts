import type { VolumeLevelSlices } from '../../@types/data/volume/VolumeLevelSlices';

/**
 * Streams one level's headerless bytes into whole-z-slice writes through `slab`, reused.
 * Throws when the stream ends short of, or runs past, sliceBytes · depth.
 */
export async function streamLevelSlabs(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  level: VolumeLevelSlices,
  slab: Uint8Array,
  writeSlices: (bytes: Uint8Array, zOffset: number, sliceCount: number) => void,
  onBytes: (byteCount: number) => void,
): Promise<void> {
  const { sliceBytes, depth } = level;
  const usable = Math.floor(slab.length / sliceBytes) * sliceBytes;
  if (usable === 0) throw new Error(`streamLevelSlabs: a ${slab.length} B slab holds no slice`);
  const total = sliceBytes * depth;
  let received = 0;
  let filled = 0;
  let zOffset = 0;
  const flush = () => {
    const sliceCount = filled / sliceBytes;
    // A view, refilled at once: safe because writeTexture copies its data at call time.
    writeSlices(slab.subarray(0, filled), zOffset, sliceCount);
    zOffset += sliceCount;
    filled = 0;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > total) {
      void reader.cancel();
      throw new Error(`streamLevelSlabs: stream runs past ${total} B`);
    }
    onBytes(value.byteLength);
    for (let offset = 0; offset < value.byteLength; ) {
      const n = Math.min(usable - filled, value.byteLength - offset);
      slab.set(value.subarray(offset, offset + n), filled);
      filled += n;
      offset += n;
      if (filled === usable) flush();
    }
  }
  if (received < total)
    throw new Error(`streamLevelSlabs: stream ends at ${received} of ${total} B`);
  if (filled > 0) flush();
}
