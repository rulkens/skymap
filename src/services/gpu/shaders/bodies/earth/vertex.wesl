// earth/vertex.wesl — vertex stage for the true-scale textured Earth.
//
// Identical projection wiring to 'star/vertex.wesl' and
// 'texturedBody/vertex.wesl': multiply each unit-sphere local position by the
// combined MVP from 'LitBodyUniforms'. The Earth is now lit, so the fragment
// needs the surface normal in the body's local frame -- and on a unit sphere
// the local position IS that normal, so it is forwarded unchanged alongside the
// mesh's equirectangular uv (which the fragment samples the Blue Marble at).
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'LitBodyUniforms' (80 bytes: the mat4x4<f32>
// MVP plus the local sun direction + ambient floor), visible in BOTH stages:
// the vertex reads 'u.mvp', the fragment reads 'u.sunDirLocal'. The texture +
// sampler live at bindings 1 and 2 for the fragment stage (declared in the
// fragment module).
//
// As with the other sphere bodies, the '@group/@binding' declaration is
// module-local (WESL has no global state), so we declare 'u' here and pass
// 'u.mvp' into the imported 'clip_from_local' helper -- the 'pass cam,
// don't capture' idiom.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       (tightly-packed f32x3 VBO, stride 12).
//   @location(1) uv:       vec2<f32>  — equirectangular texture coordinate
//                                       (tightly-packed f32x2 VBO, stride 8);
//                                       'uvSphereMesh' writes u west-to-east,
//                                       v south-to-north.

import package::bodies::earth::io::VSOut;
import package::lib::sphere::LitBodyUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: LitBodyUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.uv = uv;
  // Unit-sphere local position IS the outward normal; the fragment renormalizes.
  out.normalLocal = position;
  return out;
}
