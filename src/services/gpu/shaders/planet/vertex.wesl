// planet/vertex.wesl — vertex stage for the flat-lit albedo planet.
//
// Identical projection wiring to 'debugSphere/vertex.wesl': multiply
// each unit-sphere local position by the combined MVP, and pass the
// local position through as an interpolant. For a unit sphere the
// local position IS the outward surface normal, so no separate normal
// stream is needed — the fragment stage normalises the interpolant and
// runs its one-dot-product lambert term against a fixed light
// direction (see 'planet/fragment.wesl').
//
// The local-frame normal doubles as a world-frame normal because the
// body MVP's model half is a uniform scale + translate (no rotation —
// 'composeBodyMvp'), which preserves directions. The mesh itself is the
// z-up equatorial J2000 'uvSphereMesh', so 'localPos' z points at the
// body's north pole.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'TintedSphereUniforms' (80 bytes:
// mat4x4<f32> mvp + vec3<f32> tint, padded to 80 — see lib/sphere.wesl
// for the authoritative byte layout). Declared in BOTH this module (for
// 'mvp') and 'planet/fragment.wesl' (for 'tint', the albedo); importing
// the one authoritative struct keeps the layouts locked, the same idiom
// 'points/io.wesl' uses.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       (tightly-packed f32x3 VBO,
//                                       stride 12).

import package::lib::sphere::TintedSphereUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: TintedSphereUniforms;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Local-space position passed through for the lambert term in the
  // fragment stage. Unit sphere: localPos == outward surface normal.
  @location(0) localPos: vec3<f32>,
};

@vertex
fn vs(@location(0) position: vec3<f32>) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.localPos = position;
  return out;
}
