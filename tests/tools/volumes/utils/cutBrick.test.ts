import { describe, expect, it } from 'vitest';
import { cutBrick } from '../../../../tools/volumes/utils/cutBrick';

// ASTC 6×6 over a 48-wide slab: a block row is 8 blocks · 16 B, a brick is 8 block rows per slice.
const ROW_BYTES = 128;
const BRICK_SLICE_BYTES = 8 * ROW_BYTES;

describe('cutBrick', () => {
  // Asymmetric bricks, so swapped by and bz fail as well as an ignored one.
  it.each([
    [1, 0],
    [0, 1],
  ])("cutBrick takes each slice's run of brick (%i, %i)'s block rows", (by, bz) => {
    // Two bricks tall and two deep; even bytes name the slice, odd bytes the block row.
    const sliceBytes = 2 * BRICK_SLICE_BYTES;
    const slab = new Uint8Array(96 * sliceBytes).map((_, i) =>
      i % 2 === 0 ? Math.floor(i / sliceBytes) : Math.floor((i % sliceBytes) / ROW_BYTES),
    );

    const brick = cutBrick(slab, { sliceBytes, brickSliceBytes: BRICK_SLICE_BYTES }, by, bz);

    expect(brick.length).toBe(48 * BRICK_SLICE_BYTES);
    brick.forEach((byte, i) => {
      const slice = 48 * bz + Math.floor(i / BRICK_SLICE_BYTES);
      const row = 8 * by + Math.floor((i % BRICK_SLICE_BYTES) / ROW_BYTES);
      if (byte !== (i % 2 === 0 ? slice : row)) throw new Error(`byte ${i} is ${byte}`);
    });
  });
});
