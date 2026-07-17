// bodyGlint/vertex.wesl — billboard vertex stage for sub-pixel scene bodies.
//
// Below the mesh-resolution limit a planet/moon becomes a brightness-scaled
// additive point sprite rather than vanishing (the sub-pixel cull would
// otherwise pop the body out on descent). This is the close sibling of
// 'starPoints/vertex.wesl' — same thin additive pipeline, same 'lib/camera' +
// 'lib/billboard' helpers, same camera-relative f64-rebase seam owned by the
// layer — deliberately kept a SEPARATE pipeline from the star points (the fold
// candidate is flagged in the spec, not taken here).
//
// ## Bindings
//
// '@group(0) @binding(0)' holds the bare 80-byte 'CameraUniforms' prefix from
// 'lib/camera.wesl' (viewProj + viewportPx + two pad floats) — no
// renderer-specific tail, because per-body tint and brightness ride in the
// instance attributes.
//
// ## Attribute layout (stepMode 'instance', stride 28 bytes)
//
//   @location(0) position:   vec3<f32>  — body position, offset 0.
//   @location(1) color:      vec3<f32>  — albedo tint (linear RGB), offset 12.
//   @location(2) brightness: f32        — apparent-size x albedo x phase x fade, offset 24.
//
// Positions are f32, but the caller ('bodyGlintsLayer') hands them in already
// CAMERA-RELATIVE (anchor - eye, folded eye offset into 'viewProj' via
// 'rebaseViewProj'), both in f64, before upload — the same catastrophic-
// cancellation dodge 'starPoints' documents at length.
//
// ## Size + brightness
//
// The point grows and brightens with its computed brightness: a dim glint is a
// tiny dot, a bright one (a high-albedo body near the mesh handoff) a bigger
// glow — the additive HDR tone-map then reads brighter as larger via bloom.
// 'brightness' arrives in [0, 1); the size ramp maps it to a 2..8 px radius, and
// the tint is premultiplied by brightness so a faded/unlit glint adds no light
// (the fragment stays the star-point soft-dot).

import package::bodies::bodyGlint::io::VSOut;
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
  @location(2) brightness: f32,
) -> VSOut {
  let center = worldToClip(u, position);
  let corner = quadCorner(vi);

  // Brighter glint -> bigger dot. Base 2 px so even the dimmest glint stays
  // legible; up to 8 px for a full-brightness body. Placeholder legibility
  // ramp, tuned at the visual gate.
  let sizePx = clamp(2.0 + 6.0 * brightness, 2.0, 8.0);

  let offset = expandBillboardScreen(u, center, sizePx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent (the NEAR0 far
  // plane tracks camera distance): clamp clip-z to just inside the far plane so
  // a glint just beyond it stays on screen. Safe only because this is the
  // depthless additive HDR pass — see 'starPoints/vertex.wesl' for the full
  // argument.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;
  // Premultiply the tint by brightness: the fragment then stays identical to
  // the star-point soft-dot, and a zero-brightness glint contributes no light.
  out.color = color * brightness;
  return out;
}
