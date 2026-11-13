/**
 * packAntiqueSigns — this frame's body-sign centres into `AntiqueSigns`
 * (`bodySigns.wesl`): a u32 count, then a vec4 per sign, centre in device px.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import { ANTIQUE_MAX_SIGNS, ANTIQUE_SIGN_BYTES } from '../../../data/rendering/antiqueLook';

export function packAntiqueSigns(
  signs: readonly Vec2[],
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_SIGN_BYTES),
): ArrayBuffer {
  const count = Math.min(signs.length, ANTIQUE_MAX_SIGNS);
  new Uint32Array(out)[0] = count;
  const f32 = new Float32Array(out);
  for (let i = 0; i < count; i++) f32.set(signs[i]!, 4 + i * 4);
  return out;
}
