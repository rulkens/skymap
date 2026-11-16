// surfaceTile/fragmentBare.wesl — the no-effects variant: the tile
// albedo lit by 'pbrDirect' at the row's flat roughness, plus ambient. No
// material, night or cloud maps, so none of their bindings are declared and
// a body without Earth's whole-globe maps can still draw its tiles.

import package::bodies::surfaceTile::io::VSOut;
import package::bodies::surfaceTile::io::SurfaceTileUniforms;
import package::bodies::surfaceTile::surfaceLighting::tileAlbedo;
import package::bodies::surfaceTile::surfaceLighting::tileShadingNormal;
import package::bodies::surfaceTile::surfaceLighting::tileLodOverlay;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;

@group(0) @binding(0) var<uniform> uniforms: SurfaceTileUniforms;
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let geometricNormal = normalize(in.normalLocal); // interpolation shortens it -- renormalize
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
  let shadingNormal = tileShadingNormal(heightAtlas, in.uv, in.heightLattice, in.patchSpanRad, geometricNormal, in.tangent, uniforms.radiusM);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let viewDir = normalize(in.viewDirLocal);
  let sunDir = uniforms.sunDirLocal;

  let roughness = clamp(uniforms.roughnessBase, MIN_ROUGHNESS, 1.0);
  let direct = pbrDirect(shadingNormal, viewDir, sunDir, baseAlbedo, roughness, vec3<f32>(uniforms.f0));
  let colour = direct * uniforms.sunIrradiance + uniforms.ambientLight * baseAlbedo;

  return vec4<f32>(tileLodOverlay(colour, in.atlasUvScale.x, uniforms.debugLodOverlay), 1.0);
}
