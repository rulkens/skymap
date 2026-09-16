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

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let Ng = normalize(in.normalLocal); // interpolation shortens it -- renormalize
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
  let n = tileShadingNormal(heightAtlas, in.uv, in.heightLattice, in.patchSpanRad, Ng, in.tangent, u.radiusM);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let v = normalize(in.viewDirLocal);
  let l = u.sunDirLocal;

  let roughness = clamp(u.roughnessBase, MIN_ROUGHNESS, 1.0);
  let direct = pbrDirect(n, v, l, baseAlbedo, roughness, vec3<f32>(u.f0));
  let colour = direct * u.sunIrradiance + u.ambientLight * baseAlbedo;

  return vec4<f32>(tileLodOverlay(colour, in.atlasUvScale.x, u.debugLodOverlay), 1.0);
}
