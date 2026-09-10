// meshBody/fragment.wesl — the mesh body's material: baked TBN relief over
// 'lib/pbr.wesl's microfacet core, plus the host's Earthshine fill.
//
// LANDMINE -- there is no shadow map and no self-shadowing term. Occlusion of
// the sun by the host is the CPU-side scalar 'u.sunVisibleFraction' and nothing
// else, the same analytic posture every other body-lighting effect here takes.
//
// The whale and the pot are treated as dielectrics: 'pbrDirect's 'f0' is a
// scalar (that function is shared and deliberately has no metalness path), so
// the mr map's metallic channel is read by nobody. A metal/dielectric blend, if
// one is ever wanted, is built HERE, not inside 'pbrDirect'.

import package::bodies::meshBody::io::MeshBodyUniforms;
import package::bodies::meshBody::io::MeshBodyVSOut;
import package::lib::math::saturate;
import package::lib::pbr::pbrDirect;

@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;
@group(0) @binding(1) var meshSampler: sampler;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var metalRoughTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

// Normal-incidence reflectance of a non-metal (~4%), the value 'lib/pbr.wesl's
// header names for rock.
const DIELECTRIC_F0: f32 = 0.04;

@fragment
fn fs(in: MeshBodyVSOut) -> @location(0) vec4<f32> {
  // Renormalize AFTER interpolation: barycentric blending shortens both.
  let ng = normalize(in.worldNormal);
  let t = normalize(in.worldTangent.xyz);
  let b = cross(ng, t) * in.worldTangent.w;

  // glTF normal maps store all three signed axes; unlike 'lib/normalMap.wesl's
  // two-channel reconstruction, z is read, not recovered.
  let tilt = textureSample(normalTexture, meshSampler, in.uv).xyz * 2.0 - 1.0;
  let n = normalize(t * tilt.x + b * tilt.y + ng * tilt.z);

  let albedo = textureSample(albedoTexture, meshSampler, in.uv).rgb;
  // glTF packs roughness in G and metallic in B ('tools/meshes/buildMeshes.ts').
  let roughness = textureSample(metalRoughTexture, meshSampler, in.uv).g;

  let v = normalize(u.camPosLocal - in.localPos);
  let direct =
    pbrDirect(n, v, u.sunDirLocal, albedo, roughness, DIELECTRIC_F0) * u.sunVisibleFraction;

  // 'u.dirToHost' is a uniform, not a varying: derived per fragment it would be
  // 'normalize(-(posM + localPos))', and |posM| dwarfs |localPos| by six orders
  // of magnitude.
  let earthshine = u.earthshineColor * u.earthshineStrength * saturate(dot(n, u.dirToHost));

  return vec4<f32>(direct + earthshine, 1.0);
}
