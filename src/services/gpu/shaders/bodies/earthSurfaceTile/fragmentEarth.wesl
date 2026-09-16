// earthSurfaceTile/fragmentEarth.wesl — the materialMap + nightLights +
// cloudShadows variant; mirrors earth/fragment.wesl's shading ('pbrDirect',
// roughness split, cloud shadow, night lights), see that header for the
// derivation. Skips the whole-globe NORMAL map: patches shade from the height
// field alone (spec section 7.2).

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;
import package::bodies::earthSurfaceTile::surfaceLighting::tileAlbedo;
import package::bodies::earthSurfaceTile::surfaceLighting::tileShadingNormal;
import package::bodies::earthSurfaceTile::surfaceLighting::tileLodOverlay;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::nightLights::nightLights;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
// The same Terrain-RGB height atlas the vertex stage displaces from, read the
// same way: 'textureLoad' at an integer post, never a sampler (spec section 5.5).
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;
@group(0) @binding(3) var baseSampler: sampler;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;
@group(0) @binding(6) var materialTexture: texture_2d<f32>;
@group(0) @binding(7) var nightTexture: texture_2d<f32>;
// Binding 8 was the whole-globe normal map; it is the base globe's alone now.
@group(0) @binding(9) var cloudTexture: texture_2d<f32>;

// Inverse of 'equirectUvToDirection'. Duplicated from earth/fragment.wesl
// rather than imported: it lives inline there, not in 'lib/'.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let Ng = normalize(in.normalLocal); // interpolation shortens it -- renormalize
  let equirectUv = dirToEquirectUv(Ng);

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
  let mat = textureSample(materialTexture, baseSampler, equirectUv).rg;

  let n = tileShadingNormal(heightAtlas, in.uv, in.heightLattice, in.patchSpanRad, Ng, in.tangent, u.radiusM);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let v = normalize(in.viewDirLocal);
  let l = u.sunDirLocal;

  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), u.oceanRoughness, mat.g);
  let directBase = pbrDirect(n, v, l, baseAlbedo, roughness, vec3<f32>(u.f0));

  // Ground shadow: cast from the GEOMETRIC surface position toward the sun
  // through the cloud shell, exactly as 'earth/fragment.wesl' does.
  let roots = raySphere(Ng, l, vec3<f32>(0.0), u.cloudShellRadius);
  let crossing = Ng + roots.y * l;
  let shadowAlpha = textureSample(cloudTexture, baseSampler, dirToEquirectUv(normalize(crossing))).a;
  let direct = directBase * (1.0 - shadowAlpha * u.cloudShadowStrength);

  let colour = direct * u.sunIrradiance + u.ambientLight * baseAlbedo;

  let nightColour = textureSample(nightTexture, baseSampler, equirectUv).rgb;
  // Whether the sun is up is the DATUM's cosine, not the terrain's: keyed on
  // 'n', every slope facing away from the sun at noon read as night and lit up
  // with the city's Black Marble glow (Søndermarken's banks turned cream).
  let sunUp = max(dot(Ng, l), 0.0);
  let cloudAlphaHere = textureSample(cloudTexture, baseSampler, equirectUv).a;
  let emissive = nightLights(nightColour, sunUp, cloudAlphaHere);

  return vec4<f32>(tileLodOverlay(colour + emissive, in.atlasUvScale.x, u.debugLodOverlay), 1.0);
}
