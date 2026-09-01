/**
 * packSgrAStarLensingUniforms — pure packer for the 176-byte
 * `SgrAStarLensingUniforms` struct (`shaders/lib/sgrAStarLensing.wesl`).
 *
 * The CPU half of the uniform contract between the Sgr A* lens pass and its
 * WGSL. The struct is the shared
 * `CameraUniforms` prefix (`writeCameraPrefix`, the same helper every
 * world-space renderer uses) plus the lens's own scalar params, the LUT
 * addressing pair, this frame's fade-band alpha, and the camera-relative
 * anchor position (the f64->f32 rebase seam `bodyGlintsLayer` /
 * `starPointsLayer` already use — the caller subtracts the eye and folds
 * it into `viewProj` before calling this).
 *
 * ## Byte layout (must stay byte-exact with `shaders/lib/sgrAStarLensing.wesl`)
 *
 *   f32  0..15  (byte   0.. 63): cam.viewProj              mat4x4<f32>
 *   f32 16..17  (byte  64.. 71): cam.viewportPx             vec2<f32>
 *   f32 18..19  (byte  72.. 79): cam._pad0 / _pad1          untouched (zero)
 *   f32 20      (byte  80.. 83): schwarzschildRadiusM       f32
 *   f32 21      (byte  84.. 87): innerRs                    f32
 *   f32 22      (byte  88.. 91): outerRs                    f32
 *   f32 23      (byte  92.. 95): inclinationRad             f32
 *   f32 24      (byte  96.. 99): positionAngleRad           f32
 *   f32 25      (byte 100..103): flickerAmp                 f32
 *   f32 26      (byte 104..107): flickerTimescaleS          f32
 *   f32 27      (byte 108..111): flickerPhase               f32
 *   f32 28      (byte 112..115): lutMinImpactParamRs        f32
 *   f32 29      (byte 116..119): lutMaxImpactParamRs        f32
 *   f32 30      (byte 120..123): lutSampleCount              f32
 *   f32 31      (byte 124..127): bandAlpha                  f32
 *   f32 32..34  (byte 128..139): anchorPosRelCamM            vec3<f32>
 *   f32 35      (byte 140..143): diskScaleHeightRs — tuning knob
 *   f32 36      (byte 144..147): edgeFadeStartFraction — tuning knob
 *   f32 37      (byte 148..151): dopplerStrength — tuning knob
 *   f32 38      (byte 152..155): emissionStrength — tuning knob
 *   f32 39      (byte 156..159): edgeFadeEndRs — per-frame derived (not a knob)
 *   f32 40..42  (byte 160..171): emissionTint — tuning knob, vec3<f32>
 *   f32 43      (byte 172..175): quadPlaneRadiusRs — per-frame derived (not a knob)
 *
 * Total: 176 bytes / 44 f32. The 12 scalars at f32 20..31 exactly fill the
 * run up to f32 32, so `anchorPosRelCamM` lands on a 16-byte boundary with
 * no implicit padding — see the .wesl module header for the alignment
 * argument.
 *
 * `lutSampleCount` is packed as `f32` (the brief allows `f32` or `u32`; a
 * texel count round-trips exactly through f32 up to 2^24, far beyond any
 * plausible LUT size, so there is no precision reason to special-case a
 * `u32` write into this otherwise-uniform `Float32Array`).
 *
 * Takes a NAMED bag, not positional args: 17 of these fields are bare
 * `number`s, so a transposition (`innerRs`/`outerRs`,
 * `diskScaleHeightRs`/`edgeFadeStartFraction`) would type-check, pass the
 * offset parity test, and render subtly wrong. The table above documents each
 * field; `viewProj` is already camera-rebased and column-major, `bandAlpha`
 * is this frame's fade-band alpha, and everything in r_s or metres says so in
 * its name.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../services/gpu/lib/cameraUniforms';

/** f32 count of `SgrAStarLensingUniforms` — 80-byte cam prefix (20) + 12
 *  scalars + anchorPosRelCamM (3) + tuning knobs (4 scalars + emissionTint's
 *  3) + edgeFadeEndRs + quadPlaneRadiusRs = 44. */
export const SGR_A_STAR_LENSING_UNIFORM_FLOATS = CAMERA_UNIFORM_BYTES / 4 + 24;

export function packSgrAStarLensingUniforms(input: {
  readonly viewProj: Float32Array | Mat4;
  readonly viewportPx: Vec2;
  readonly schwarzschildRadiusM: number;
  readonly innerRs: number;
  readonly outerRs: number;
  readonly inclinationRad: number;
  readonly positionAngleRad: number;
  readonly flickerAmp: number;
  readonly flickerTimescaleS: number;
  readonly flickerPhase: number;
  readonly lutMinImpactParamRs: number;
  readonly lutMaxImpactParamRs: number;
  readonly lutSampleCount: number;
  readonly bandAlpha: number;
  readonly anchorPosRelCamM: Readonly<Vec3>;
  readonly diskScaleHeightRs: number;
  readonly edgeFadeStartFraction: number;
  readonly dopplerStrength: number;
  readonly emissionStrength: number;
  readonly edgeFadeEndRs: number;
  readonly emissionTint: Readonly<Vec3>;
  readonly quadPlaneRadiusRs: number;
}): Float32Array {
  const {
    viewProj,
    viewportPx,
    schwarzschildRadiusM,
    innerRs,
    outerRs,
    inclinationRad,
    positionAngleRad,
    flickerAmp,
    flickerTimescaleS,
    flickerPhase,
    lutMinImpactParamRs,
    lutMaxImpactParamRs,
    lutSampleCount,
    bandAlpha,
    anchorPosRelCamM,
    diskScaleHeightRs,
    edgeFadeStartFraction,
    dopplerStrength,
    emissionStrength,
    edgeFadeEndRs,
    emissionTint,
    quadPlaneRadiusRs,
  } = input;
  const out = new Float32Array(SGR_A_STAR_LENSING_UNIFORM_FLOATS);
  writeCameraPrefix(out, viewProj, viewportPx); // f32 0..17; 18..19 stay zero
  out[20] = schwarzschildRadiusM; // byte 80
  out[21] = innerRs; // byte 84
  out[22] = outerRs; // byte 88
  out[23] = inclinationRad; // byte 92
  out[24] = positionAngleRad; // byte 96
  out[25] = flickerAmp; // byte 100
  out[26] = flickerTimescaleS; // byte 104
  out[27] = flickerPhase; // byte 108
  out[28] = lutMinImpactParamRs; // byte 112
  out[29] = lutMaxImpactParamRs; // byte 116
  out[30] = lutSampleCount; // byte 120
  out[31] = bandAlpha; // byte 124
  out[32] = anchorPosRelCamM[0]; // byte 128 — vec3, 16-byte aligned
  out[33] = anchorPosRelCamM[1]; // byte 132
  out[34] = anchorPosRelCamM[2]; // byte 136
  out[35] = diskScaleHeightRs; // byte 140
  out[36] = edgeFadeStartFraction; // byte 144
  out[37] = dopplerStrength; // byte 148
  out[38] = emissionStrength; // byte 152
  out[39] = edgeFadeEndRs; // byte 156 — per-frame derived (not a knob)
  out[40] = emissionTint[0]; // byte 160 — vec3
  out[41] = emissionTint[1]; // byte 164
  out[42] = emissionTint[2]; // byte 168
  out[43] = quadPlaneRadiusRs; // byte 172 — per-frame derived (not a knob)
  return out;
}
