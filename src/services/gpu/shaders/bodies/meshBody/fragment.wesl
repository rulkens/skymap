// meshBody/fragment.wesl — the mesh body's material: baked TBN relief over a
// GGX metal/dielectric blend, lit by the Sun as a sphere light and by the
// body's own reflection probe as its environment. The probe IS the ambient:
// there is no fill and no night-side floor.
//
// LANDMINE -- there is no shadow map and no self-shadowing term. Occlusion of
// the sun by the host is the CPU-side scalar 'u.sunVisibleFraction' and nothing
// else, the same analytic posture every other body-lighting effect here takes.
//
// The metal blend is built HERE and handed to 'lib/pbr.wesl' as 'f0'.

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;
import package::lib::pbr::pbrDirectSphere;
import package::lib::pbr::envSplitSum;

@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var metalRoughTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;
@group(0) @binding(5) var probeTexture: texture_cube<f32>;
@group(1) @binding(0) var meshSampler: sampler;
@group(1) @binding(1) var envBrdfLut: texture_2d<f32>;
@group(1) @binding(2) var lutSampler: sampler;

// Normal-incidence reflectance of a non-metal (~4%), 'lib/pbr.wesl's rock value.
const DIELECTRIC_F0: f32 = 0.04;

// Mirrors 'EARTH_SURFACE_PARAMS.sunIrradiance' (data/bodies/earthSurfaceParams.ts).
// The probe captures the planets in 'litShade' units, so the direct term must
// share that one scale or a metal reflects its host at the wrong brightness.
const SUN_IRRADIANCE: f32 = 3.0;

@fragment
fn fs(in: MeshBodyVSOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4<f32> {
  // Barycentric blending shortens both and skews the tangent off the normal:
  // renormalize and Gram-Schmidt, so the bitangent 'cross' comes out unit-length.
  // No cull: negating 'ng' holds 't' and inverts 'b' -- the frame a back face is seen through.
  let ng = normalize(in.worldNormal) * select(-1.0, 1.0, frontFacing);
  let t = normalize(in.worldTangent.xyz - ng * dot(ng, in.worldTangent.xyz));
  let b = cross(ng, t) * in.worldTangent.w;

  let tilt = textureSample(normalTexture, meshSampler, in.uv).xyz * 2.0 - 1.0;
  let n = normalize(t * tilt.x + b * tilt.y + ng * tilt.z);

  let albedo = textureSample(albedoTexture, meshSampler, in.uv).rgb;
  // glTF packs roughness in G and metallic in B ('tools/meshes/buildMeshes.ts').
  let mr = textureSample(metalRoughTexture, meshSampler, in.uv).gb;
  let roughness = mr.x;
  let metallic = mr.y;
  let f0 = mix(vec3<f32>(DIELECTRIC_F0), albedo, metallic);
  let diffuseAlbedo = albedo * (1.0 - metallic);

  let v = normalize(u.camPosLocal - in.localPos);
  let direct =
    pbrDirectSphere(n, v, u.sunDirLocal, diffuseAlbedo, roughness, f0, u.sinSunAngularRadius) *
    SUN_IRRADIANCE * u.sunVisibleFraction;
  let env = envSplitSum(
    n, v, diffuseAlbedo, roughness, f0, probeTexture, meshSampler, envBrdfLut, lutSampler,
  );

  return vec4<f32>(direct + env, 1.0);
}
