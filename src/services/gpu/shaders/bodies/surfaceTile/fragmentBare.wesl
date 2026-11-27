// surfaceTile/fragmentBare.wesl — the no-effects variant: the tile
// albedo lit by 'pbrDirect' at the row's flat roughness, plus ambient, each
// dimmed by the baked horizon (sun and sky visibility). No
// material, night or cloud maps, so none of their bindings are declared and
// a body without Earth's whole-globe maps can still draw its tiles.

import package::bodies::surfaceTile::io::VSOut;
import package::bodies::surfaceTile::io::SurfaceTileUniforms;
import package::bodies::surfaceTile::surfaceLighting::tileAlbedo;
import package::bodies::surfaceTile::surfaceLighting::tileLodOverlay;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::surfaceLight::composeSurfaceLight;
import package::lib::horizonLookup::horizonVisibility;
import package::lib::horizonLookup::localSunAngles;
import package::lib::meshShadow::MeshShadowCasters;
import package::lib::meshShadow::MeshShadowFilter;
import package::lib::meshShadow::meshShadowVisibility;

@group(0) @binding(0) var<uniform> uniforms: SurfaceTileUniforms;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;
// Horizon angles per post, read by lib/horizonLookup.wesl (a zero rect skips it).
@group(0) @binding(11) var horizonAtlas: texture_2d<f32>;
// The site bodies' sun shadows on this ground (lib/meshShadow.wesl; count 0 reads lit).
@group(1) @binding(0) var<uniform> meshCasters: MeshShadowCasters;
@group(1) @binding(1) var meshShadowMap: texture_depth_2d_array;
@group(1) @binding(2) var meshShadowSampler: sampler_comparison;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let baseAlbedo = tileAlbedo(
    surfaceTexture,
    atlasSampler,
    in.uv,
    in.atlasUvOrigin,
    in.atlasUvScale,
    in.fallbackUvOrigin,
    in.fallbackUvScale,
    in.fadeWeight,
  );
  let shadingNormal = normalize(in.shadingNormal);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let viewDir = normalize(in.viewDirLocal);
  let sunDir = uniforms.sunDirLocal;

  let roughness = clamp(uniforms.roughnessBase, MIN_ROUGHNESS, 1.0);
  let direct = pbrDirect(shadingNormal, viewDir, sunDir, baseAlbedo, roughness, vec3<f32>(uniforms.f0));
  // The datum normal, not the shaded one: the bake measured angles from the sphere's up.
  let sunAngles = localSunAngles(in.normalLocal, sunDir);
  let horizon = horizonVisibility(
    horizonAtlas, in.horizonRect, in.uv, sunAngles.x, sunAngles.y, uniforms.sunAngularRadiusRad,
  );
  // Eye-relative metres, precise at a rover's scale (never 'normalLocal': 0.25 m steps at Mars radius).
  let eyeRelPosM = -in.viewDirLocal * uniforms.radiusM;
  var meshSun = 1.0;
  let meshFilter = MeshShadowFilter(meshCasters.depthBiasTexels, meshCasters.filterRadiusTexels, meshCasters.filterSide);
  for (var caster = 0; caster < meshCasters.count; caster++) {
    let lightClip = meshCasters.lightFromEye[caster] * vec4<f32>(eyeRelPosM, 1.0);
    meshSun *= meshShadowVisibility(meshShadowMap, meshShadowSampler, meshCasters.slots[caster], lightClip.xyz, meshFilter);
  }
  let colour = composeSurfaceLight(
    direct * uniforms.sunIrradiance, uniforms.ambientLight * baseAlbedo, horizon.x * meshSun, horizon.y,
  );

  return vec4<f32>(tileLodOverlay(colour, in.atlasUvScale.x, uniforms.debugLodOverlay), 1.0);
}
