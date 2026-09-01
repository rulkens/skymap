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
//   offset 140 : _pad2                    f32  — rounds the struct to 144 / 16-byte
//   total: 144 bytes.
//
// The 12 scalar fields (80..127, 48 bytes) exactly fill the run up to 128,
// so 'anchorPosRelCamM' lands on a 16-byte boundary with no implicit padding
// — the same "count the scalars before a vec3" check 'camera.wesl' and
// 'milkyWay/sprites/io.wesl' document. The CPU-side 'Float32Array' must
// write each field at the matching f32 index (see 'packSgrAStarLensingUniforms.ts',
// the single source of truth for that half of the contract) or the GPU
// silently reads garbage — no compile error, no runtime error, just a wrong
// (or on iOS, dropped) frame.

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
  _pad2: f32,
};
