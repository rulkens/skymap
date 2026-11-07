/**
 * packAntiqueUniforms — `AntiqueUniformInput` into the 96-byte record
 * `shaders/antiqueLook/io.wesl` declares; that file's table is the byte map.
 */

import type { AntiqueUniformInput } from '../../../@types/rendering/AntiqueUniformInput';
import { ANTIQUE_UNIFORM_BYTES } from '../../../data/rendering/antiqueLook';

const FLAG_BODIES = 1;
const FLAG_CAPTIONS = 2;
const FLAG_PAPER = 4;
const FLAG_DEPTH_COVER = 8;

export function packAntiqueUniforms(
  input: AntiqueUniformInput,
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_UNIFORM_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  const u32 = new Uint32Array(out);
  f32[0] = input.size.width;
  f32[1] = input.size.height;
  f32[2] = input.unitPx;
  u32[3] =
    (input.bodies ? FLAG_BODIES : 0) |
    (input.captions ? FLAG_CAPTIONS : 0) |
    (input.paper ? FLAG_PAPER : 0) |
    (input.depthCover ? FLAG_DEPTH_COVER : 0);
  const { tl, tr, bl, br } = input.rays;
  [tl, tr, bl, br].forEach((ray, i) => f32.set(ray, 4 + i * 4));
  f32[20] = input.seed;
  f32[21] = input.rulings.raDeg;
  f32[22] = input.rulings.decDeg;
  f32[23] = input.hatchAngle;
  return out;
}
