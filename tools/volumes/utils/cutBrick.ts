import type { BrickCutLayout } from '../../@types/volumes/BrickCutLayout';
import { VOLUME_BRICK_EDGE } from '../../../src/data/volume/volumeBrickEdge';

/** Brick (by, bz) of an encoded slab one brick wide: per z-slice of the brick, the contiguous run
 *  at slice · sliceBytes + by · brickSliceBytes. Block formats tile each slice in 2D, so a brick's
 *  block rows in one slice are one run, in the order `writeTexture` takes them. */
export function cutBrick(
  slab: Uint8Array,
  { sliceBytes, brickSliceBytes }: BrickCutLayout,
  by: number,
  bz: number,
): Uint8Array {
  const out = new Uint8Array(VOLUME_BRICK_EDGE * brickSliceBytes);
  for (let s = 0; s < VOLUME_BRICK_EDGE; s++) {
    const at = (bz * VOLUME_BRICK_EDGE + s) * sliceBytes + by * brickSliceBytes;
    out.set(slab.subarray(at, at + brickSliceBytes), s * brickSliceBytes);
  }
  return out;
}
