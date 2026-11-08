/**
 * packAntiqueUniforms — `AntiqueUniformInput` into the record
 * `shaders/antiqueLook/io.wesl` declares; that file's table is the byte map.
 */

import type { AntiqueUniformInput } from '../../../@types/rendering/AntiqueUniformInput';
import { ANTIQUE_UNIFORM_BYTES } from '../../../data/rendering/antiqueLook';

const FLAG_BODIES = 1;
const FLAG_CAPTIONS = 2;
const FLAG_PAPER = 4;
const FLAG_DEPTH_COVER = 8;
const FLAG_RELIEF = 16;
const FLAG_MOON = 32;
// The engraved ground's print code rides above the flags (`fragment.wesl` RELIEF_PRINT_SHIFT).
const RELIEF_PRINT_SHIFT = 8;

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
    (input.depthCover ? FLAG_DEPTH_COVER : 0) |
    (input.moon ? FLAG_MOON : 0) |
    (input.relief === null ? 0 : FLAG_RELIEF | (input.relief << RELIEF_PRINT_SHIFT));
  const { tl, tr, bl, br } = input.rays;
  [tl, tr, bl, br].forEach((ray, i) => f32.set(ray, 4 + i * 4));
  f32[7] = input.web;
  [11, 15, 19].forEach((lane, i) => (f32[lane] = input.eye[i]!));
  f32[20] = input.seed;
  f32[21] = input.hatchAngle;
  f32[23] = input.subject;
  // The sky's and a globe's `RulingFrame`, 20 floats each; no globe packs as zeros.
  [input.rulings.sky, input.rulings.globe].forEach((frame, i) => {
    const at = 24 + i * 20;
    f32.fill(0, at, at + 20);
    if (frame === null) return;
    const { axes: a, lon, lat } = frame;
    f32.set([a[0], a[1], a[2], frame.lonOffsetDeg, a[3], a[4], a[5], frame.net], at);
    f32.set([a[6], a[7], a[8], 0, ...(frame.globeCentre ?? [0, 0, 0])], at + 8);
    f32.set([lon.stepDeg, lat.stepDeg, lon.cellDeg, lat.cellDeg], at + 16);
  });
  const { tune } = input;
  f32[22] = tune.borderWash;
  f32.set([tune.hatchUnits, tune.washGain, tune.inkGain, tune.lineInk, ...tune.tint], 64);
  u32[71] = tune.hidden;
  f32[72] = tune.letterWear;
  return out;
}
