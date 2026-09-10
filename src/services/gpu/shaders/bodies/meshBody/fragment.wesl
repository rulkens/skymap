// meshBody/fragment.wesl — the mesh body's material: baked TBN relief over
// 'lib/pbr.wesl's microfacet core, plus the host's Earthshine fill.
//
// LANDMINE -- there is no shadow map and no self-shadowing term. Occlusion of
// the sun by the host is the CPU-side scalar 'u.sunVisibleFraction' and nothing
// else, the same analytic posture every other body-lighting effect here takes.
//
// The bodies are dielectrics: 'pbrDirect's 'f0' is a scalar, so the mr map's
// metallic channel is read by nobody. A metal/dielectric blend, if ever wanted,
// is built HERE, not inside 'pbrDirect'.

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;
import package::lib::math::saturate;
import package::lib::pbr::pbrDirect;

@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;
@group(0) @binding(1) var meshSampler: sampler;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var metalRoughTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

// Normal-incidence reflectance of a non-metal (~4%), 'lib/pbr.wesl's rock value.
const DIELECTRIC_F0: f32 = 0.04;

// Mirrors 'EARTH_SURFACE_PARAMS.sunIrradiance' (data/bodies/earthSurfaceParams.ts)
// -- the scale that puts 'pbrDirect's unit sun at the litShade bodies' brightness.
const SUN_IRRADIANCE: f32 = 3.0;

@fragment
fn fs(in: MeshBodyVSOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4<f32> {
  // Barycentric blending shortens both and skews the tangent off the normal:
  // renormalize and Gram-Schmidt, so the bitangent 'cross' comes out unit-length.
  // No cull: negating 'ng' holds 't' and inverts 'b' -- the frame a back face is seen through.
  let ng = normalize(in.worldNormal) * select(-1.0, 1.0, frontFacing);
  let t = normalize(in.worldTangent.xyz - ng * dot(ng, in.worldTangent.xyz));
  let b = cross(ng, t) * in.worldTangent.w;

  // glTF normal maps store all three signed axes; unlike 'lib/normalMap.wesl's
  // two-channel reconstruction, z is read, not recovered.
  let tilt = textureSample(normalTexture, meshSampler, in.uv).xyz * 2.0 - 1.0;
  let n = normalize(t * tilt.x + b * tilt.y + ng * tilt.z);

  let albedo = textureSample(albedoTexture, meshSampler, in.uv).rgb;
  // glTF packs roughness in G and metallic in B ('tools/meshes/buildMeshes.ts').
  let roughness = textureSample(metalRoughTexture, meshSampler, in.uv).g;

  let v = normalize(u.camPosLocal - in.localPos);
  let direct = pbrDirect(n, v, u.sunDirLocal, albedo, roughness, DIELECTRIC_F0) *
    SUN_IRRADIANCE * u.sunVisibleFraction;

  // 'u.dirToHost' is a uniform, not a varying: derived per fragment it would be
  // 'normalize(-(posM + localPos))' -- |posM| dwarfs |localPos| a millionfold.
  let earthshine =
    albedo * u.earthshineColor * u.earthshineStrength * saturate(dot(n, u.dirToHost));

  return vec4<f32>(direct + earthshine, 1.0);
}
