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
import package::lib::horizonLookup::horizonSunVisibility;
import package::lib::horizonLookup::horizonSkyVisibility;
import package::lib::horizonLookup::localSunAngles;

@group(0) @binding(0) var<uniform> uniforms: SurfaceTileUniforms;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;
// Horizon angles per post, read by lib/horizonLookup.wesl (a zero rect skips it).
@group(0) @binding(11) var horizonAtlas: texture_2d<f32>;

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
  let sunVisibility = horizonSunVisibility(
    horizonAtlas, in.horizonRect, in.uv, sunAngles.x, sunAngles.y, uniforms.sunAngularRadiusRad,
  );
  let skyVisibility = horizonSkyVisibility(horizonAtlas, in.horizonRect, in.uv);
  let colour = composeSurfaceLight(
    direct * uniforms.sunIrradiance, uniforms.ambientLight * baseAlbedo, sunVisibility, skyVisibility,
  );

  return vec4<f32>(tileLodOverlay(colour, in.atlasUvScale.x, uniforms.debugLodOverlay), 1.0);
}
