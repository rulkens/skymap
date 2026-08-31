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

// Mirrored from 'EARTH_TILE_PX' (earthTileParams.ts) -- parity-tested
// alongside EARTH_TILE_ATLAS_SIDE above. 'TILE_SLOT_SCALE' is the atlas-uv
// width of a tile drawn from ITS OWN slot (no ancestor fallback); the
// LOD-overlay tint below divides a resolved rect's actual width into this
// to recover how many pyramid levels the fallback walked.
const EARTH_TILE_PX: f32 = 512.0;
const TILE_SLOT_SCALE: f32 = EARTH_TILE_PX / EARTH_TILE_ATLAS_SIDE;

// Inverse of 'equirectUvToDirection', bakeSurfaceTileMesh.ts's CPU twin --
// duplicated from earth/fragment.wesl rather than imported: it lives
// inline there, not in 'lib/', and this task creates new files only.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

// earthLodOverlayColor -- the 'earth-lod-overlay' toggle's ladder: green =
// this fragment's own leaf tile is resident, yellow/orange/red = 1/2/3+
// levels coarser (an ancestor's atlas slot stood in for it). Flat per-band
// rather than an interpolated ramp: the ask is "how many levels", a small
// integer a reader should be able to name at a glance, not a continuous
// quantity.
fn earthLodOverlayColor(levelDelta: u32) -> vec3<f32> {
  if (levelDelta == 0u) {
    return vec3<f32>(0.10, 0.75, 0.15); // green
  } else if (levelDelta == 1u) {
    return vec3<f32>(0.95, 0.85, 0.05); // yellow
  } else if (levelDelta == 2u) {
    return vec3<f32>(0.95, 0.55, 0.05); // orange
  }
  return vec3<f32>(0.90, 0.10, 0.05); // red, 3+
}

// Half-texel inset clamp shared by the primary and fallback rects (the
// crossfade's two atlas samples) -- see the call sites for why: the raw
// map can land a bilinear tap's footprint half a texel past a resolved
// rect's edge, which is a DIFFERENT slot's pixels. A deep ancestor
// fallback (levelDelta >= ~7) can flatten a rect to under one atlas texel
// wide; the raw half-texel inset would then push min past max, which
// clamp() leaves indeterminate -- cap the inset at half the rect itself.
fn resolveTileAtlasUv(origin: vec2<f32>, scale: vec2<f32>, uv: vec2<f32>) -> vec2<f32> {
  let raw = origin + uv * scale;
  let inset = min(vec2<f32>(EARTH_TILE_ATLAS_HALF_TEXEL), 0.5 * scale);
  return clamp(raw, origin + inset, origin + scale - inset);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let Ng = normalize(in.normalLocal); // interpolation shortens it -- renormalize
  let equirectUv = dirToEquirectUv(Ng);

  // Crossfade: mix the freshly-landed primary tile in over the coarser
  // fallback it's replacing. At fadeWeight 1 (the CPU-side encoding for
  // both "fully faded in" and "no fallback resident" -- see io.wesl's
  // NodeParams doc) mix() returns primaryAlbedo exactly, so this is
  // pixel-identical to a single-sample path at that weight.
  let primaryUv = resolveTileAtlasUv(in.atlasUvOrigin, in.atlasUvScale, in.uv);
  let primaryAlbedo = textureSampleLevel(surfaceTexture, atlasSampler, primaryUv, 0.0).rgb;
  let fallbackUv = resolveTileAtlasUv(in.fallbackUvOrigin, in.fallbackUvScale, in.uv);
  let fallbackAlbedo = textureSampleLevel(surfaceTexture, atlasSampler, fallbackUv, 0.0).rgb;
  let baseAlbedo = mix(fallbackAlbedo, primaryAlbedo, in.fadeWeight);
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

  var finalColour = colour + emissive;
  // Earth LOD overlay ('u.debugLodOverlay' > 0.5) -- a runtime, not
  // compile-time, lens, so it stays live rather than compiling to dead code.
  // 'atlasUvScale.x' is this fragment's resolved rect width; TILE_SLOT_SCALE
  // is what that width would be with NO ancestor fallback, so their ratio is
  // '2^levelDelta' by construction (resolveCutResidency halves the rect per
  // level walked) -- see the module header and SurfaceCutTile's doc comment
  // for why levelDelta itself is never carried as its own field.
  if (u.debugLodOverlay > 0.5) {
    let levelDelta = u32(round(log2(max(TILE_SLOT_SCALE / in.atlasUvScale.x, 1.0))));
    let overlayColour = earthLodOverlayColor(levelDelta);
    finalColour = mix(finalColour, overlayColour, 0.6);
  }

  return vec4<f32>(finalColour, 1.0);
}
