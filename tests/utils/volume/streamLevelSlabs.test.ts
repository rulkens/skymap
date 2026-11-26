import { describe, expect, it } from 'vitest';
import { streamLevelSlabs } from '../../../src/utils/volume/streamLevelSlabs';

// Slice 6 B, depth 5 (30 B); a 13 B slab holds two whole slices (12 B usable).
const LEVEL = { sliceBytes: 6, depth: 5 };

/** A reader yielding consecutive bytes 0, 1, 2, … split into chunks of the given sizes. */
function readerOf(chunkSizes: readonly number[]): ReadableStreamDefaultReader<Uint8Array> {
  let next = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunkSizes) {
        controller.enqueue(Uint8Array.from({ length: size }, () => next++));
      }
      controller.close();
    },
  }).getReader();
}

type Write = { bytes: number[]; zOffset: number; sliceCount: number };

async function stream(chunkSizes: readonly number[]) {
  const writes: Write[] = [];
  const counted: number[] = [];
  await streamLevelSlabs(
    readerOf(chunkSizes),
    LEVEL,
    new Uint8Array(13),
    // Copied: the bytes view the slab, which the next chunk overwrites.
    (bytes, zOffset, sliceCount) => writes.push({ bytes: [...bytes], zOffset, sliceCount }),
    (byteCount) => counted.push(byteCount),
  );
  return { writes, counted };
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

describe('streamLevelSlabs', () => {
  it('chunks at arbitrary boundaries become whole-slice writes in z order', async () => {
    const { writes } = await stream([1, 7, 4, 11, 7]);
    expect(writes).toEqual([
      { bytes: range(0, 12), zOffset: 0, sliceCount: 2 },
      { bytes: range(12, 24), zOffset: 2, sliceCount: 2 },
      { bytes: range(24, 30), zOffset: 4, sliceCount: 1 },
    ]);
  });

  it('a short stream throws', async () => {
    await expect(stream([10, 19])).rejects.toThrow(/29 of 30/);
  });

  it('a long stream throws', async () => {
    await expect(stream([10, 21])).rejects.toThrow(/past 30/);
  });

  it('onBytes sums to the level’s length', async () => {
    const { counted } = await stream([1, 7, 4, 11, 7]);
    expect(counted.reduce((a, b) => a + b, 0)).toBe(30);
  });
});
