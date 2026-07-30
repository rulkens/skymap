// earth/vertex.wesl — vertex stage for the true-scale textured Earth.
//
// Identical projection wiring to 'star/vertex.wesl': multiply each unit-sphere
// local position by the combined MVP from 'LitBodyUniforms'. (The textured
// bodies share the mesh but inflate it into a ray-tracing proxy, so their
// vertex stage is no longer a twin of this one.) The Earth is lit, so the
// fragment needs the surface normal in the body's local frame -- and on a unit
// sphere the local position IS that normal, so it is forwarded alongside the
// mesh's equirectangular uv (which the fragment samples the Blue Marble at).
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'EarthSurfaceUniforms' (112 bytes: the
// mat4x4<f32> MVP, the local sun direction, and the PBR shading params), visible
// in BOTH stages: the vertex reads only 'u.mvp', the fragment reads the sun
// direction, camera position, and material knobs. The fragment stage also binds
// the sampler at binding 1 and the per-kind textures from binding 2 up (declared
// in the fragment module) -- see 'earthRenderer.ts' for the current bound set.
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
//                                       'cubeSphereMesh' writes u west-to-east,
//                                       v south-to-north.
//   @location(2) tangent:  vec3<f32>  — unit local-space +u (east) tangent
//                                       (tightly-packed f32x3 VBO, stride 12);
//                                       'cubeSphereMesh' emits (-sinLon,cosLon,0).
//                                       Forwarded raw; the fragment re-orthonormalizes.

import package::bodies::earth::io::VSOut;
import package::lib::sphere::EarthSurfaceUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: EarthSurfaceUniforms;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) tangent: vec3<f32>,
) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.uv = uv;
  // Unit-sphere local position IS the outward normal; the fragment renormalizes.
  out.normalLocal = position;
  // +u (east) tangent, forwarded raw -- the fragment Gram-Schmidt-re-orthonormalizes
  // it against the interpolated normal before building the tangent-space basis.
  out.tangent = tangent;
  return out;
}
