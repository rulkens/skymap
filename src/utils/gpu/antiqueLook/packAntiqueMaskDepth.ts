/**
 * packAntiqueMaskDepth — the `MaskDepth` uniform `antiqueLook/mask.wesl` declares
 * (its struct is the byte map): the camera's forward and, per plate body in the
 * plate's order, the depth row's near plane in that body's radii. Infinite-far
 * reversed-Z only (depth = near / view z); any other row, or none, writes 0, the
 * shader's "no metric depth".
 */

import type { Slab } from '../../../@types/engine/frame/Slab';
import type { Vec3 } from '../../../@types/math/Vec3';
import { ANTIQUE_MASK_DEPTH_BYTES } from '../../../data/rendering/antiqueLook';
import { ANTIQUE_PLATE_BODY_CAPACITY } from '../../../data/rendering/antiquePlateBodies';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export function packAntiqueMaskDepth(
  row: Slab | null,
  radiiM: readonly number[],
  forward: Readonly<Vec3>,
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_MASK_DEPTH_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  f32.fill(0);
  f32.set(forward, 0);
  if (row === null || !row.reversedZ) return out;
  const nearM = row.frame.kind === 'body-m' ? row.near : row.near * SCALE_UNITS.MPC_TO_M;
  const count = Math.min(radiiM.length, ANTIQUE_PLATE_BODY_CAPACITY);
  for (let i = 0; i < count; i++) f32[4 + i] = nearM / radiiM[i]!;
  return out;
}
