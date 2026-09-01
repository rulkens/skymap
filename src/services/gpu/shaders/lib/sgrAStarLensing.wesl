// lib/sgrAStarLensing.wesl — byte-layout contract (exceeds the usual header
// budget on that basis, same allowance camera.wesl takes) for the Sgr A*
// lens pass's per-frame uniform buffer.
//
// This is the struct-only half of the contract task-10 owns; the pass that
// binds it (the lens vertex/fragment pair, LUT texture sampling, the fold
// image itself) is Task 13's job, not this file's. 'SchwarzschildDeflectionLut
// .samples' upload as a separate 1D texture, NOT a field here — only the two
// scalars that address it ('lutMinImpactParamRs'/'lutMaxImpactParamRs') and
// its texel count ride in the uniform buffer.
//
// ## Byte layout (canonical — the offset authority for the CPU packer)
//
//   offset   0 : cam: CameraUniforms      (80 B shared prefix — viewProj
//                                           0..63, viewportPx 64..71,
//                                           _pad0 72..75, _pad1 76..79)
//   offset  80 : schwarzschildRadiusM     f32  — r_s in metres
//   offset  84 : innerRs                  f32  — emission annulus inner edge, r_s units
//   offset  88 : outerRs                  f32  — emission annulus outer edge, r_s units
//   offset  92 : inclinationRad           f32
//   offset  96 : positionAngleRad         f32
//   offset 100 : flickerAmp               f32
//   offset 104 : flickerTimescaleS        f32
//   offset 108 : flickerPhase             f32  — sim-clock-derived, per-frame
//   offset 112 : lutMinImpactParamRs      f32  — SchwarzschildDeflectionLut.minImpactParamRs
//   offset 116 : lutMaxImpactParamRs      f32  — SchwarzschildDeflectionLut.maxImpactParamRs
//   offset 120 : lutSampleCount           f32  — LUT texture's texel count
//   offset 124 : bandAlpha                f32  — fade band's own alpha this frame
//   offset 128 : anchorPosRelCamM         vec3<f32>  — camera-relative anchor, metres (f64->f32 rebase seam)
//   offset 140 : diskScaleHeightRs        f32  — T15 TEMP tuning knob, was fragment.wesl's DISK_SCALE_HEIGHT_RS const
//   offset 144 : edgeFadeStartFraction    f32  — T15 TEMP tuning knob, was the escape branch's hardcoded '* 0.7'
//   offset 148 : dopplerStrength          f32  — T15 TEMP tuning knob, was fragment.wesl's DOPPLER_STRENGTH const
//   offset 152 : emissionStrength         f32  — T15 TEMP tuning knob (2nd addendum), overall annulus-emission multiplier
//   offset 156 : edgeFadeEndRs            f32  — escape fade's end impact parameter, r_s units (NOT a T15 knob:
//                                                derived per frame by the layer — min(subpixel-deflection b, 0.6·camera
//                                                distance), floored at lutMaxImpactParamRs; survives the T15 removal)
//   offset 160 : emissionTint             vec3<f32>  — T15 TEMP tuning knob (2nd addendum), overall annulus-emission tint
//   offset 172 : _pad5                    f32  — T15 TEMP, rounds the struct to 176 / 16-byte
//   total: 176 bytes.
//
// The 12 scalar fields (80..127, 48 bytes) exactly fill the run up to 128,
// so 'anchorPosRelCamM' lands on a 16-byte boundary with no implicit padding
// — the same "count the scalars before a vec3" check 'camera.wesl' and
// 'milkyWay/sprites/io.wesl' document. The CPU-side 'Float32Array' must
// write each field at the matching f32 index (see 'packSgrAStarLensingUniforms.ts',
// the single source of truth for that half of the contract) or the GPU
// silently reads garbage — no compile error, no runtime error, just a wrong
// (or on iOS, dropped) frame.
//
// TASK 15 TEMPORARY: every field after 'anchorPosRelCamM' is a DebugPanel
// tuning knob (Tier 2 of the task-15 brief, plus its 2nd-round addendum
// adding emissionStrength/emissionTint), deleted — struct shrunk back to
// 144 bytes — at the removal step once Task 17 converges on final values.

import package::lib::camera::CameraUniforms;

struct SgrAStarLensingUniforms {
  cam: CameraUniforms,
  schwarzschildRadiusM: f32,
  innerRs: f32,
  outerRs: f32,
  inclinationRad: f32,
  positionAngleRad: f32,
  flickerAmp: f32,
  flickerTimescaleS: f32,
  flickerPhase: f32,
  lutMinImpactParamRs: f32,
  lutMaxImpactParamRs: f32,
  lutSampleCount: f32,
  bandAlpha: f32,
  anchorPosRelCamM: vec3<f32>,
  diskScaleHeightRs: f32,
  edgeFadeStartFraction: f32,
  dopplerStrength: f32,
  emissionStrength: f32,
  edgeFadeEndRs: f32,
  emissionTint: vec3<f32>,
  _pad5: f32,
};
