// texturedBody/vertex.wesl — vertex stage for a textured planet or moon.
//
// Identical projection wiring to 'earth/vertex.wesl': multiply each
// unit-sphere local position by the combined MVP from 'TexturedBodyUniforms'.
// This body is lit, so the fragment needs the surface normal in the body's
// local frame -- and on a unit sphere the local position IS that normal, so it
// is forwarded unchanged alongside the equirectangular uv.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'TexturedBodyUniforms' (112 bytes), visible in
// BOTH stages: the vertex reads 'u.mvp', the fragment reads 'u.sunDirLocal' and
// the ring ratios. The sampler + two textures live at bindings 1..3 for the
// fragment stage (declared in the fragment module).
//
// As with the other sphere bodies, the '@group/@binding' declaration is
// module-local (WESL has no global state), so we declare 'u' here and pass
// 'u.mvp' into the imported 'clip_from_local' helper -- the 'pass cam, don't
// capture' idiom.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       (tightly-packed f32x3 VBO, stride 12).
//   @location(1) uv:       vec2<f32>  — equirectangular texture coordinate
//                                       (tightly-packed f32x2 VBO, stride 8);
//                                       'uvSphereMesh' writes u west-to-east,
//                                       v south-to-north.

import package::bodies::texturedBody::io::VSOut;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.uv = uv;
  // Unit-sphere local position IS the outward normal; the fragment renormalizes.
  out.normalLocal = position;
  return out;
}
