// starPoints/vertex.wesl — billboard vertex stage for distant scene stars.
//
// The neighbourhood's stars render as additive point sprites in the
// depthless HDR accumulation — the same visual language as the survey
// point cloud, but through a THIN DEDICATED pipeline rather than the
// survey 'points/' shaders. The survey vertex stage threads per-source
// fade/source/focus bind groups, Malmquist gating, pick identity and a
// 52-byte instance layout; a handful of seeded scene stars needs none
// of that. What IS shared is the underlying billboard math: this module
// imports the same 'lib/camera' + 'lib/billboard' helpers, so the
// projection and pixel-sizing derivations stay single-sourced.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds the bare 80-byte 'CameraUniforms'
// prefix from 'lib/camera.wesl' (viewProj + viewportPx + two pad
// floats) — no renderer-specific tail, because per-star colour and
// magnitude ride in the instance attributes.
//
// ## Attribute layout (stepMode 'instance', stride 28 bytes)
//
//   @location(0) position: vec3<f32>  — star position, offset 0.
//   @location(1) color:    vec3<f32>  — linear-RGB spectral tint, offset 12.
//   @location(2) absMag:   f32        — absolute magnitude, offset 24.
//
// Positions are f32, but the caller ('starPointsLayer') hands them in
// already CAMERA-RELATIVE: it subtracts the eye from each anchor and folds
// the eye offset into 'viewProj' (via 'rebaseViewProj'), both in f64, before
// upload. Without that rebase the raw parsec-scale anchor (~1e-6 Mpc from the
// render origin) and the raw view translation would be near-equal large
// numbers whose f32 subtraction here cancels catastrophically, jittering the
// sprite centre as the camera closes on a local star. Rebased, both operands
// of 'worldToClip' are small and well-conditioned, so f32 suffices.
//
// ## Point size
//
// sizePx = clamp(6.0 - 0.45 * absMag, 1.5, 8.0)
//
// A linear ramp in magnitude: absMag 0 (a giant) -> 6 px, the Sun
// (absMag 4.83) -> ~3.8 px, absMag 10 (a red dwarf) -> the 1.5 px
// floor. Placeholder legibility formula — brighter star, bigger dot —
// not photometry; the real flux-based LOD (and the point-to-sphere
// crossover) is plan-03 work, which is also why there is no distance
// term yet.

import package::bodies::starPoints::io::VSOut;
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> u: CameraUniforms;

// Depth epsilon: pull the clamped clip-z this far inside the far plane (in
// ndc-z terms) so a point sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) absMag: f32,
) -> VSOut {
  let center = worldToClip(u, position);
  let corner = quadCorner(vi);

  // Placeholder absMag -> pixel-radius ramp; see the module header.
  let sizePx = clamp(6.0 - 0.45 * absMag, 1.5, 8.0);

  let offset = expandBillboardScreen(u, center, sizePx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent. The NEAR0 far
  // plane tracks camera distance ('foregroundFrustum': far = camDist * 100), so
  // diving onto one star collapses it to just past that star and the OTHER
  // parsec-scale points fall beyond it and frustum-clip. Clamping clip-z to just
  // inside the far plane keeps them on screen. This is safe ONLY because this is
  // the depthless additive HDR point pass — no depth test or write — so a
  // clamped z perturbs no depth comparison; the depth-tested bodies (Earth /
  // star spheres / planets) keep the tight far plane for their depth precision.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;
  out.color = color;
  return out;
}
