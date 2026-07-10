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
// Positions are f32 (narrowed from the seed's f64 Mpc values). That is
// deliberate: the f64 compose path matters for sphere-filling bodies,
// where sub-metre camera-relative error is visible on a surface — but a
// star drawn AS A POINT subtends less than a pixel by definition, so
// f32 position error (relative eps ~1e-7 of the ~1e-6 Mpc coordinate)
// stays far below a pixel at any camera distance that shows the point
// at all. The caller passes the slab's f32 narrow view-projection.
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

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> u: CameraUniforms;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Per-star linear-RGB tint, flat across the quad.
  @location(1) color: vec3<f32>,
};

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
  out.uv = corner;
  out.color = color;
  return out;
}
