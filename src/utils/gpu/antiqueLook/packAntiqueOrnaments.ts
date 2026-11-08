/**
 * packAntiqueOrnaments — this frame's instances into `AntiqueOrnaments`
 * (`shaders/antiqueLook/ornaments.wesl` holds the byte map). Rows past
 * `ANTIQUE_MAX_ORNAMENTS` are dropped; the list is authored far below it.
 */

import type { AntiqueOrnamentInstance } from '../../../@types/rendering/AntiqueOrnamentInstance';
import { ANTIQUE_MAX_ORNAMENTS, ANTIQUE_ORNAMENT_BYTES } from '../../../data/rendering/antiqueLook';

const HEADER_F32 = 4;
const ROW_F32 = 16;

export function packAntiqueOrnaments(
  instances: readonly AntiqueOrnamentInstance[],
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_ORNAMENT_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  const u32 = new Uint32Array(out);
  const count = Math.min(instances.length, ANTIQUE_MAX_ORNAMENTS);
  u32[0] = count;
  for (let i = 0; i < count; i++) {
    const o = instances[i]!;
    const at = HEADER_F32 + i * ROW_F32;
    f32.set([...o.centrePx, ...o.halfPx, Math.cos(o.rotation), Math.sin(o.rotation)], at);
    f32[at + 6] = o.opacity;
    f32[at + 7] = o.clearsBeneath ? 1 : 0;
    f32.set(o.rect, at + 8);
    f32[at + 12] = o.pigment;
    f32[at + 13] = o.lettering ? 1 : 0;
    f32[at + 14] = o.accent;
    f32[at + 15] = o.washFollowsInk ? 1 : 0;
  }
  return out;
}
