// cloudShell/vertex.wesl — vertex stage for the translucent cloud shell.
//
// Identical projection wiring to 'earth/vertex.wesl' and the other sphere
// bodies: multiply each unit-sphere local position by the combined MVP from
// 'CloudShellUniforms'. The caller's 'composeBodyMvp' scales the unit sphere to
// the shell radius (just above the surface) and places it in the body's frame,
// so this stage stays a plain matrix multiply. The fragment is lit, so it needs
// the surface normal in the body's local frame -- and on a unit sphere the local
// position IS that normal, so it is forwarded unchanged alongside the mesh's
// equirectangular uv (which the fragment samples the cloud map at).
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'CloudShellUniforms' (80 bytes: the mat4x4<f32>
// MVP, the body-local sun direction, and the cloud opacity), visible in BOTH
// stages: the vertex reads only 'u.mvp', the fragment reads the sun direction and
// opacity. The fragment stage also binds the sampler at binding 1 and the cloud
// texture at binding 2 (declared in the fragment module).
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

import package::bodies::cloudShell::io::VSOut;
import package::lib::sphere::CloudShellUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: CloudShellUniforms;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  out.uv = uv;
  // Unit-sphere local position IS the outward normal; the fragment renormalizes.
  out.normalLocal = position;
  return out;
}
