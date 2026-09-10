// meshBody/vertex.wesl — PLACEHOLDER (Task 15).
//
// Rasterises the authored mesh's own triangles, in metres: no proxy shell and
// no inflation, unlike the sphere bodies. Task 16 adds the rotated normal and
// tangent varyings the PBR fragment needs; this stub carries only what the
// placeholder fragment reads.

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;

@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) tangent: vec4<f32>,
  @location(3) uv: vec2<f32>,
) -> MeshBodyVSOut {
  var out: MeshBodyVSOut;
  out.clip = u.mvp * vec4<f32>(position, 1.0);
  out.localPos = u.model * position;
  out.uv = uv;
  return out;
}
