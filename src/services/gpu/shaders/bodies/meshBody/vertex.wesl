// meshBody/vertex.wesl — vertex stage for a lit triangle-mesh body.
//
// Rasterises the authored mesh's own triangles, in metres: no proxy shell and
// no inflation, unlike the sphere bodies, so the interpolated normal IS the
// surface normal and needs no analytic recovery.
//
// Normal, tangent and 'localPos' are rotated by 'uniforms.model' -- the body's tumble
// only. Putting 'uniforms.mvp' on any of them would drag the view and projection into
// vectors the fragment dots against 'uniforms.camPosLocal' and 'uniforms.sunDirLocal', which
// are packed in the host's fixed axes ('io.wesl's frame contract).

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;

@group(0) @binding(0) var<uniform> uniforms: MeshBodyUniforms;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) tangent: vec4<f32>,
  @location(3) uv: vec2<f32>,
) -> MeshBodyVSOut {
  var out: MeshBodyVSOut;
  out.clip = uniforms.mvp * vec4<f32>(position, 1.0);
  // 'uniforms.model' is a pure rotation, so it is its own inverse-transpose: no normal
  // matrix is needed, and the fragment renormalizes after interpolation anyway.
  out.worldNormal = uniforms.model * normal;
  // Handedness is a sign, not a direction -- it must NOT be rotated.
  out.worldTangent = vec4<f32>(uniforms.model * tangent.xyz, tangent.w);
  out.uv = uv;
  out.localPos = uniforms.model * position;
  return out;
}
