// earth/vertex.wesl — vertex stage for the true-scale textured Earth.
//
// Identical projection wiring to 'star/vertex.wesl' and
// 'planet/vertex.wesl': multiply each unit-sphere local position by the
// combined MVP from 'SphereUniforms'. The only difference is what gets
// passed through to the fragment stage -- here it is the mesh's
// equirectangular uv, not the local position, because the Earth fragment
// samples a texture rather than deriving a normal.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'SphereUniforms' (64 bytes, one mat4x4<f32>),
// visible in the vertex stage only. The texture + sampler live at
// bindings 1 and 2 for the fragment stage (declared in the fragment module).
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
import package::lib::sphere::SphereUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: SphereUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.uv = uv;
  return out;
}
