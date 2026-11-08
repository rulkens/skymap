/**
 * packAntiqueRelief — `AntiqueReliefInput` into the record `shaders/antiqueLook/relief.wesl`
 * declares; that file's table is the byte map. The eye is split into a whole-cell anchor
 * (integers) and a small remainder, both from f64, so the shader's noise stays pinned to
 * the ground to the millimetre at any distance from the body's centre.
 */

import { mat4d } from 'wgpu-matrix';
import type { AntiqueReliefInput } from '../../../@types/rendering/AntiqueReliefInput';
import {
  ANTIQUE_RELIEF_ANCHOR_LOG2,
  ANTIQUE_RELIEF_ORBIT_ALT_M,
  ANTIQUE_RELIEF_UNIFORM_BYTES,
} from '../../../data/rendering/antiqueRelief';

const ANCHOR_M = 2 ** ANTIQUE_RELIEF_ANCHOR_LOG2;

export function packAntiqueRelief(
  input: AntiqueReliefInput,
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_RELIEF_UNIFORM_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  const i32 = new Int32Array(out);
  const eye = input.eyeRelBodyM;
  f32.set(mat4d.inverse(input.vp), 0);
  f32.set(input.vp, 16);
  const cells = eye.map((c) => Math.round(c / ANCHOR_M));
  for (let k = 0; k < 3; k++) {
    f32[32 + k] = eye[k]! - cells[k]! * ANCHOR_M;
    i32[36 + k] = cells[k]!;
  }
  const altitude = Math.hypot(...eye) - input.datumRadiusM;
  const [low, high] = ANTIQUE_RELIEF_ORBIT_ALT_M;
  const t = Math.min(Math.max((altitude - low) / (high - low), 0), 1);
  const orbit = t * t * (3 - 2 * t);
  f32[35] = orbit;
  const [groundK, orbitK] = input.body.exaggeration;
  f32[39] = groundK + (orbitK - groundK) * orbit;
  f32.set(input.sun, 40);
  f32[43] = input.radPerPx;
  f32.set(eye, 44);
  f32[47] = input.unitPx;
  f32[48] = input.size.width;
  f32[49] = input.size.height;
  const elevation = (input.lightElevationDeg * Math.PI) / 180;
  f32[50] = Math.sin(elevation);
  f32[51] = Math.cos(elevation);
  f32[52] = input.body.cellM;
  f32[53] = input.body.slopeInk;
  f32[54] = input.body.wideNormal ? 1 : 0;
  f32[55] = input.reveal;
  f32[56] = input.body.contourPeriodM ?? 0;
  return out;
}
