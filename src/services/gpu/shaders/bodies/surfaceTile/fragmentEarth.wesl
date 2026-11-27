// surfaceTile/fragmentEarth.wesl — the materialMap + nightLights +
// cloudShadows variant; mirrors earth/fragment.wesl's shading ('pbrDirect',
// roughness split, cloud shadow, night lights), see that header for the
// derivation. Skips the whole-globe NORMAL map: patches shade from the height
// field alone (spec section 7.2), through the vertex stage's 'shadingNormal'.

import package::bodies::surfaceTile::io::VSOut;
import package::bodies::surfaceTile::io::SurfaceTileUniforms;
import package::bodies::surfaceTile::surfaceLighting::tileAlbedo;
import package::bodies::surfaceTile::surfaceLighting::tileLodOverlay;
import package::bodies::surfaceTile::surfaceLighting::tileNight;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::surfaceLight::composeSurfaceLight;
import package::lib::horizonLookup::horizonVisibility;
import package::lib::horizonLookup::localSunAngles;
import package::lib::meshShadow::MeshShadowCasters;
import package::lib::meshShadow::meshShadowVisibility;
import package::lib::nightLights::nightLights;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> uniforms: SurfaceTileUniforms;
@group(0) @binding(3) var baseSampler: sampler;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;
@group(0) @binding(6) var materialTexture: texture_2d<f32>;
@group(0) @binding(7) var nightTexture: texture_2d<f32>;
// Binding 8 was the whole-globe normal map; it is the base globe's alone now.
@group(0) @binding(9) var cloudTexture: texture_2d<f32>;
// Night tiles (z7 and shallower), drawn like the albedo atlas through 'atlasSampler'.
@group(0) @binding(10) var nightAtlas: texture_2d<f32>;
// Horizon angles per post, read by lib/horizonLookup.wesl (a zero rect skips it).
@group(0) @binding(11) var horizonAtlas: texture_2d<f32>;
// The site bodies' sun shadows on this ground (lib/meshShadow.wesl; count 0 reads lit).
@group(1) @binding(0) var<uniform> meshCasters: MeshShadowCasters;
@group(1) @binding(1) var meshShadowMap: texture_depth_2d_array;
@group(1) @binding(2) var meshShadowSampler: sampler_comparison;

// Inverse of 'equirectUvToDirection'. Duplicated from earth/fragment.wesl
// rather than imported: it lives inline there, not in 'lib/'.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let geometricNormal = normalize(in.normalLocal); // interpolation shortens it -- renormalize
  let equirectUv = dirToEquirectUv(geometricNormal);

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

  let shadingNormal = normalize(in.shadingNormal);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let viewDir = normalize(in.viewDirLocal);
  let sunDir = uniforms.sunDirLocal;

  let roughness = mix(clamp(mat.r * uniforms.roughnessBase, MIN_ROUGHNESS, 1.0), uniforms.oceanRoughness, mat.g);
  let directBase = pbrDirect(shadingNormal, viewDir, sunDir, baseAlbedo, roughness, vec3<f32>(uniforms.f0));

  // Ground shadow: cast from the GEOMETRIC surface position toward the sun
  // through the cloud shell, exactly as 'earth/fragment.wesl' does.
  let roots = raySphere(geometricNormal, sunDir, vec3<f32>(0.0), uniforms.cloudShellRadius);
  let crossing = geometricNormal + roots.y * sunDir;
  let shadowUv = dirToEquirectUv(normalize(crossing));
  let shadowCoverage = textureSample(cloudTexture, baseSampler, shadowUv).r;
  let direct = directBase * (1.0 - shadowCoverage * uniforms.cloudShadowStrength);

  // The datum normal, not the shaded one: the bake measured angles from the sphere's up.
  let sunAngles = localSunAngles(geometricNormal, sunDir);
  let horizon = horizonVisibility(
    horizonAtlas, in.horizonRect, in.uv, sunAngles.x, sunAngles.y, uniforms.sunAngularRadiusRad,
  );
  // Eye-relative metres, precise at a rover's scale (never 'normalLocal': 0.25 m steps at Mars radius).
  let eyeRelPosM = -in.viewDirLocal * uniforms.radiusM;
  var meshSun = 1.0;
  for (var caster = 0; caster < meshCasters.count; caster++) {
    let lightClip = meshCasters.lightFromEye[caster] * vec4<f32>(eyeRelPosM, 1.0);
    meshSun *= meshShadowVisibility(meshShadowMap, meshShadowSampler, meshCasters.slots[caster], lightClip.xyz);
  }
  let colour = composeSurfaceLight(
    direct * uniforms.sunIrradiance, uniforms.ambientLight * baseAlbedo, horizon.x * meshSun, horizon.y,
  );

  // Both samples are unconditional: 'textureSample' needs uniform control
  // flow, and a zero-scale rect (no night tile resident) picks the global one.
  let globalNight = textureSample(nightTexture, baseSampler, equirectUv).rgb;
  let tileNightColour = tileNight(nightAtlas, atlasSampler, in.uv, in.nightRect);
  let nightColour = select(globalNight, tileNightColour, in.nightRect.z > 0.0);
  // Whether the sun is up is the DATUM's cosine, not the terrain's: keyed on
  // 'shadingNormal', every slope facing away from the sun at noon read as night and lit up
  // with the city's Black Marble glow (Søndermarken's banks turned cream).
  let sunUp = max(dot(geometricNormal, sunDir), 0.0);
  let cloudCoverageHere = textureSample(cloudTexture, baseSampler, equirectUv).r;
  let emissive = nightLights(nightColour, sunUp, cloudCoverageHere);

  return vec4<f32>(tileLodOverlay(colour + emissive, in.atlasUvScale.x, uniforms.debugLodOverlay), 1.0);
}
