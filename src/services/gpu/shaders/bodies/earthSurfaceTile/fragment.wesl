// earthSurfaceTile/fragment.wesl — shading maths, over budget on that
// basis. Mirrors earth/fragment.wesl's composition ('lib/pbr.wesl'
// 'pbrDirect', the ocean/land roughness split, cloud ground-shadow,
// night-lights) so a resident tile reads as a seamless closeup of the same
// globe -- see that file's header for the physical derivation of each
// term, not repeated here. Differs only in addressing: 'surfaceTexture' is
// the earthTileSubsystem ATLAS, sampled at the CPU-RESOLVED rect
// ('atlasUvOrigin + uv * atlasUvScale') in place of the base globe's
// per-fragment page-table lookup (Task 2's 'cutSurfaceTiles' already
// resolved it once per LEAF); 'material'/'night'/'normal'/'clouds' stay
// the SAME whole-globe textures, sampled at an equirect uv reconstructed
// from the interpolated local normal (this mesh carries only intra-tile
// uv -- see io.wesl).

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::nightLights::nightLights;
import package::lib::normalMap::perturbNormal;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(3) var baseSampler: sampler;
@group(0) @binding(4) var atlasSampler: sampler;
@group(0) @binding(5) var surfaceTexture: texture_2d<f32>;
@group(0) @binding(6) var materialTexture: texture_2d<f32>;
@group(0) @binding(7) var nightTexture: texture_2d<f32>;
@group(0) @binding(8) var normalTexture: texture_2d<f32>;
@group(0) @binding(9) var cloudTexture: texture_2d<f32>;

// Mirrored from 'EARTH_TILE_ATLAS_SIDE' (earthTileParams.ts) -- parity-tested
// in constants.parity.test.ts, ?static linking does no value injection. Half
// an ATLAS texel, in atlas-uv units: the inset that keeps a bilinear tap at
// a resolved rect's edge from crossing into a DIFFERENT slot's pixels. The
// sampler's own 'clamp-to-edge' (see the renderer) only guards the ATLAS's
// own edge, not a slot's -- this is the guard the old page-table shader's
// 'TILE_HALF_TEXEL' clamp was, ported to a rect already expressed as
// absolute atlas uv rather than slot-local uv + a separate cell offset.
const EARTH_TILE_ATLAS_SIDE: f32 = 8192.0;
const EARTH_TILE_ATLAS_HALF_TEXEL: f32 = 0.5 / EARTH_TILE_ATLAS_SIDE;

// Inverse of 'equirectUvToDirection', bakeSurfaceTileMesh.ts's CPU twin --
// duplicated from earth/fragment.wesl rather than imported: it lives
// inline there, not in 'lib/', and this task creates new files only.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let Ng = normalize(in.normalLocal); // interpolation shortens it -- renormalize
  let equirectUv = dirToEquirectUv(Ng);

  // Clamped to the rect's interior BEFORE sampling: the raw map can land a
  // bilinear tap's footprint half a texel past a resolved rect's edge,
  // which is a DIFFERENT slot's pixels (or, inside a levelDelta>0
  // ancestor's own image, still correct data -- clamping there just insets
  // by a fraction of a texel, harmlessly).
  let atlasUvRaw = in.atlasUvOrigin + in.uv * in.atlasUvScale;
  // A deep ancestor fallback (levelDelta >= ~7) can flatten the rect to under one atlas
  // texel wide; the raw half-texel inset would then push min past max, which clamp()
  // leaves indeterminate -- cap the inset at half the rect itself.
  let atlasUvInset = min(vec2<f32>(EARTH_TILE_ATLAS_HALF_TEXEL), 0.5 * in.atlasUvScale);
  let atlasUvMin = in.atlasUvOrigin + atlasUvInset;
  let atlasUvMax = in.atlasUvOrigin + in.atlasUvScale - atlasUvInset;
  let atlasUv = clamp(atlasUvRaw, atlasUvMin, atlasUvMax);
  let baseAlbedo = textureSampleLevel(surfaceTexture, atlasSampler, atlasUv, 0.0).rgb;
  let mat = textureSample(materialTexture, baseSampler, equirectUv).rg;

  let nEnc = textureSample(normalTexture, baseSampler, equirectUv).rg;
  let n = perturbNormal(Ng, in.tangent, nEnc);
  // Cancellation-free view vector -- see vertex.wesl's 'viewDirLocal'.
  let v = normalize(in.viewDirLocal);
  let l = u.sunDirLocal;

  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), u.oceanRoughness, mat.g);
  let directBase = pbrDirect(n, v, l, baseAlbedo, roughness, u.f0);

  // Ground shadow: cast from the GEOMETRIC surface position toward the sun
  // through the cloud shell, exactly as 'earth/fragment.wesl' does.
  let roots = raySphere(Ng, l, vec3<f32>(0.0), u.cloudShellRadius);
  let crossing = Ng + roots.y * l;
  let shadowAlpha = textureSample(cloudTexture, baseSampler, dirToEquirectUv(normalize(crossing))).a;
  let direct = directBase * (1.0 - shadowAlpha * u.cloudShadowStrength);

  let colour = direct * u.sunIrradiance + u.ambientLight * baseAlbedo;

  let nightColour = textureSample(nightTexture, baseSampler, equirectUv).rgb;
  let NoL = max(dot(n, l), 0.0);
  let cloudAlphaHere = textureSample(cloudTexture, baseSampler, equirectUv).a;
  let emissive = nightLights(nightColour, NoL, cloudAlphaHere);

  return vec4<f32>(colour + emissive, 1.0);
}
