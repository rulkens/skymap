// meshBody/fragment.wesl — PLACEHOLDER (Task 15): albedo only.
//
// Task 16 replaces this with the real material: TBN from the rotated
// normal/tangent, the metal-rough and normal maps, 'lib/pbr.wesl's 'pbrDirect'
// scaled by 'u.sunVisibleFraction', plus the Earthshine fill term
// ('u.earthshineColor * u.earthshineStrength * clamp(dot(n, u.dirToHost))').
// Bindings 2 and 4 are declared here so the explicit bind-group layout and the
// module agree from the start.

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;

@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;
@group(0) @binding(1) var meshSampler: sampler;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var metalRoughTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

@fragment
fn fs(in: MeshBodyVSOut) -> @location(0) vec4<f32> {
  let albedo = textureSample(albedoTexture, meshSampler, in.uv).rgb;
  return vec4<f32>(albedo, 1.0);
}
