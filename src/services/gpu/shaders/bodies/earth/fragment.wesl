// earth/fragment.wesl — fragment stage for the true-scale textured Earth.
//
// Samples an equirectangular Blue Marble albedo at the mesh uv and a co-registered
// LINEAR material map (roughness in .r, ocean mask in .g), shaded by the shared
// 'lib/pbr.wesl' 'pbrDirect' microfacet core under the sun-relative light
// direction. Before the real bitmaps arrive the bound textures are 1x1
// placeholders (mid-blue albedo, all-land material), so this same path draws a
// plain lit, glint-free blue sphere rather than black or absent (see
// 'earthRenderer.ts' header). Design background:
// docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md.
//
//   roughness = mix(clamp(mat.r * roughnessBase, MIN_ROUGHNESS, 1), u.oceanRoughness, mat.g)
//   direct    = pbrDirect(n, v, l, albedo, roughness, f0) * (1 - cloudShadow.a * cloudShadowStrength)
//   colour    = direct * sunIrradiance + ambientLight * albedo
//   emissive  = nightLights(nightColour, NoL, cloud.a)   // added, not lit
//   return      colour + emissive
//
// The cloud shell (binding 6) couples back onto the surface in two places, both
// sampling the same sRGB cloud map: a ground-shadow ray toward the sun dims the
// DIRECT term (not the ambient floor, so the shadow self-limits at the
// terminator) where it exits the shell; and the fragment's own cloud alpha dims
// 'nightLights' city-lights under overcast. The 1x1 transparent placeholder
// reports alpha 0 before the bitmap lands, so both couplings are inert.
//
// Earth reads a per-draw 'u.ambientLight' uniform rather than the shared
// 'AMBIENT' const other lit bodies use, so earthshine/moonlight stays
// user-tunable; it seeds from the same 0.08 the const holds.
//
// ## Normal: renormalize before the dot
//
// 'normalLocal' arrives interpolated, which shortens it -- normalize before the
// Lambert dot or the terminator bands. The geometric normal is then perturbed by
// the tangent-space normal map (binding 5) via 'lib/normalMap.wesl' 'perturbNormal';
// its bitangent 'cross(Ng, Tn)' points +v=north, matching 'bakeNormalMap.ts's
// row/sign convention.
//
// ## uv orientation
//
// 'cubeSphereMesh' emits v south-to-north; the renderer uploads Blue Marble with
// 'flipY: true' so texture v=0 matches the mesh's south-first v -- no remap here.
// u needs no remap either: longitude rides +Y in the mesh's J2000 frame, which
// winds CCW as seen from outside and matches an equirectangular map's
// east-increases-left-to-right convention. The mesh bakes u = lon/2pi + 0.5, so
// the prime meridian samples the map's centre u=0.5 where Blue Marble paints
// longitude 0 -- a raw lon/2pi would rotate every continent 180deg about the pole.
//
// ## The surface virtual texture (bindings 7-9)
//
// A page table (binding 7) names, per cell of 'in.uv', which atlas slot (binding
// 8) covers it. Derived from 'in.uv' alone -- no new varying, because an extra
// @location cost this project 1.5 ms once. The whole layer is strictly ADDITIVE
// as a property of the DATA, not a branch: the page table's A channel is the
// blend weight, and every degradation path (no manifest, no atlas, a 404 on
// every tile, ground beyond the window, the 1x1 all-zero placeholder before the
// subsystem engages) arrives as A = 0, so there is no hole state to design
// around. 'earthTileSubsystem.ts' owns residency, 'buildEarthPageTable.ts' the
// projection this reads, and 'planEarthTiles.ts' the window (enforced there, not
// here: an out-of-window tile is never requested).
//
// ## Blend target
//
// Output @location(0) writes 'rgba16float'; straight-alpha OVER blending means we
// emit STRAIGHT colour with alpha=1. The albedo/night textures are
// 'rgba8unorm-srgb' (hardware linearises on read); material/normal are LINEAR.

import package::bodies::earth::io::VSOut;
import package::lib::sphere::EarthSurfaceUniforms;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::nightLights::nightLights;
import package::lib::normalMap::perturbNormal;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> u: EarthSurfaceUniforms;
@group(0) @binding(1) var earthSampler: sampler;
@group(0) @binding(2) var earthTexture: texture_2d<f32>;
@group(0) @binding(3) var materialTexture: texture_2d<f32>;
@group(0) @binding(4) var nightTexture: texture_2d<f32>;
@group(0) @binding(5) var normalTexture: texture_2d<f32>;
@group(0) @binding(6) var cloudTexture: texture_2d<f32>;
// The surface virtual texture. The page table is INTEGER data -- a slot column,
// a slot row, a level and a weight -- read with 'textureLoad' and never
// filtered, the same rule that keeps normal maps off '-srgb'. The atlas gets its
// own sampler because 'repeat' on u is right for a whole-globe equirect map and
// wrong here, where the texel past a slot's edge belongs to an unrelated tile.
@group(0) @binding(7) var tilePageTable: texture_2d<u32>;
@group(0) @binding(8) var tileAtlas: texture_2d<f32>;
@group(0) @binding(9) var tileSampler: sampler;

// Hand mirrors of 'data/bodies/earthTileParams.ts'; a test, not the compiler,
// keeps these from drifting from their TS twins ('?static' linking has no value
// injection) -- see 'earthTileConstants.parity.test.ts'.
const EARTH_TILE_WINDOW_SIDE: u32 = 128u;
const EARTH_TILE_PX: f32 = 512.0;
const EARTH_TILE_ATLAS_SIDE: f32 = 8192.0;

// Derived rather than written out, so the atlas geometry has one home here too.
// 'TILE_SLOT_SCALE' turns slot-relative coordinates into atlas uv;
// 'TILE_HALF_TEXEL' keeps a bilinear tap at a slot edge inside its own tile.
const TILE_SLOT_SCALE: f32 = EARTH_TILE_PX / EARTH_TILE_ATLAS_SIDE;
const TILE_HALF_TEXEL: f32 = 0.5 / EARTH_TILE_PX;

// Finest pyramid level the LOD overlay's ramp is calibrated against (see
// 'earthLodOverlayColor' below) -- the deepest regional bake level, not a
// hard ceiling: a level beyond it just clamps to the same red as z19.
const EARTH_LOD_OVERLAY_MAX_LEVEL: u32 = 19u;

// TILE_DEBUG -- the tint probe, for a human to flip. A wrong window is INVISIBLE
// in the final image (the base texture is a plausible picture of Earth at every
// uv, so a misaddressed cell just looks like Earth) and obvious in false colour,
// which is why the house rule is to check the hypothesis in-shader before
// trusting the blend. Being a 'const' makes the unused arms dead code, so the
// shipped shader at 0u pays nothing to carry it.
//
//   0u -- off; the real blend.
//
//   1u -- the page table's B channel (level): one flat hue per pyramid level,
//         BLACK wherever no tile is named. CORRECT looks like a single coloured
//         cap centred on the ground the camera is over, black everywhere else
//         including the far hemisphere; the cap is one flat hue, briefly gaining
//         a second while a finer level is part-loaded, and descending steps the
//         whole cap to the next hue as it shrinks. WRONG looks like: a cap on
//         the far side of the globe or in the opposite hemisphere (a winX0 /
//         winY0 wrap or sign error); a cap that slides with the camera's
//         rotation instead of staying on the sub-camera point; bands that split
//         along latitude only (the '1 - v' flip); black under the camera at low
//         altitude (the window test inverted).
//
//   2u -- the page table's A channel (weight): RED at 0, through YELLOW, to
//         GREEN at 1. CORRECT looks like red everywhere the base is showing --
//         the far hemisphere and the ground past the window frontier -- solid
//         green under resident tiles, and a brief yellow ramp as each tile lands
//         and fades in. WRONG looks like: green over the whole globe (the window
//         mask not applied); or a cap that stays red while the Network tab shows
//         tiles arriving (the page table uploaded against a different window
//         than the uniform carries).
const TILE_DEBUG: u32 = 0u;

// dirToEquirectUv -- maps a unit direction to the mesh's equirectangular uv (the
// same convention 'cubeSphereMesh' bakes and the flipY:true bitmaps expect), for
// the ground-shadow crossing point, which has no interpolated in.uv to reuse.
// u = east longitude/TAU + 0.5 (the TEXTURE_PRIME_MERIDIAN_U convention, also
// baked into 'cubeSphereMesh.ts' and 'uvSphereMesh.ts' -- WESL can't import the
// TS constant, so it's re-encoded here). v maps latitude south(0)-to-north(1),
// matching the mesh's south-first v.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

// debugTileLevelTint -- one distinct flat hue per pyramid level, for TILE_DEBUG
// mode 1. A cosine palette stepped by the golden ratio rather than a lookup
// table: levels 5 to 13 all have to be told apart, and the irrational step is
// what guarantees two ADJACENT levels never land on similar hues -- which is
// exactly the confusion the probe exists to rule out.
fn debugTileLevelTint(level: u32) -> vec3<f32> {
  let t = fract(f32(level) * 0.618034);
  return 0.5 + 0.5 * cos(TAU * (t + vec3<f32>(0.0, 0.33, 0.67)));
}

// earthLodOverlayColor -- the 'debug.showEarthLodOverlay' toggle's ramp:
// MONOTONIC coarse-to-fine (unlike 'debugTileLevelTint's golden-ratio hue
// scatter above, which deliberately keeps adjacent levels UNRELATED so no two
// look alike at a glance). Here the ask is the opposite -- a reader should see
// "further along the pyramid" as "further along the ramp" -- so a 4-segment
// blue -> cyan -> green -> yellow -> red gradient is sampled at the integer
// 'level' itself. No interpolation ever spans two different pixels' levels
// (each pixel picks the single colour for ITS OWN integer level), which is
// what gives neighbouring bands a hard edge rather than a smooth gradient.
fn earthLodOverlayColor(level: u32) -> vec3<f32> {
  let t = clamp(f32(level) / f32(EARTH_LOD_OVERLAY_MAX_LEVEL), 0.0, 1.0);
  let seg = t * 4.0;
  let blue = vec3<f32>(0.05, 0.05, 0.55);
  let cyan = vec3<f32>(0.05, 0.60, 0.75);
  let green = vec3<f32>(0.10, 0.75, 0.15);
  let yellow = vec3<f32>(0.95, 0.85, 0.05);
  let red = vec3<f32>(0.90, 0.10, 0.05);
  if (seg < 1.0) {
    return mix(blue, cyan, seg);
  } else if (seg < 2.0) {
    return mix(cyan, green, seg - 1.0);
  } else if (seg < 3.0) {
    return mix(green, yellow, seg - 2.0);
  } else {
    return mix(yellow, red, clamp(seg - 3.0, 0.0, 1.0));
  }
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Mesh uv sampled directly -- no flip needed (see the header). Albedo is
  // 'rgba8unorm-srgb' (linearised on read); material is LINEAR 'rgba8unorm' so
  // its packed roughness (.r) / ocean mask (.g) read as raw numbers, not colour.
  let baseAlbedo = textureSample(earthTexture, earthSampler, in.uv).rgb;
  let mat = textureSample(materialTexture, earthSampler, in.uv).rg;

  // ── The surface virtual texture ──────────────────────────────────────────
  // The window ('u.zWin'/'winX0'/'winY0') says where the page table sits on the
  // pyramid -- small integers carried as f32 (see 'lib/sphere.wesl'). All-zero is
  // the identity: the state before the subsystem engages.
  let zWin = u32(u.zWin);

  // Column count at the window level: 'cols = 1 << z', right by construction
  // because 'derivePlannerParams' (earthTileSubsystem.ts) REFUSES a manifest
  // whose tile edge disagrees with EARTH_TILE_PX above -- nothing here reads
  // tilePx, so a differently-cut pyramid would silently resolve to wrong ground.
  // Rows are half the columns (a plate-carree raster is always 2x as wide as tall).
  let cols = 1u << zWin;
  // Mesh v counts north from the south pole; tile row 0 is the north edge, hence
  // '1 - in.uv.y'. Must agree with 'earthTileXyForUv.ts' (CPU side) or the
  // surface samples the wrong latitude band -- reads as "subtly off", not a fault.
  let px = u32(in.uv.x * f32(cols));
  let py = u32((1.0 - in.uv.y) * f32(cols >> 1u));

  // Longitude wraps modulo 'cols' (lets a window straddle the antimeridian, same
  // as 'buildEarthPageTable'). Latitude is NOT periodic, so its subtraction is
  // deliberately left to UNDERFLOW: north of the window 'py - winY0' wraps huge,
  // so one unsigned compare per axis covers both ends branch-free.
  let dx = (px + cols - u32(u.winX0)) % cols;
  let dy = py - u32(u.winY0);
  let inWindow = dx < EARTH_TILE_WINDOW_SIDE && dy < EARTH_TILE_WINDOW_SIDE;
  let windowMask = select(0.0, 1.0, inWindow);

  // Clamped rather than branched: the load happens either way, and 'windowMask'
  // zeroes an out-of-window result. Cell = (slot col, slot row, tile level, blend
  // weight).
  let cellXy = vec2<u32>(
    min(dx, EARTH_TILE_WINDOW_SIDE - 1u),
    min(dy, EARTH_TILE_WINDOW_SIDE - 1u)
  );
  let cell = textureLoad(tilePageTable, cellXy, 0);

  // The cell's tile may be COARSER than the window's level -- not an edge case
  // but the degradation path itself: refinement is progressive from the base
  // upward while a finer tile is in flight. So the within-tile uv derives from
  // the level in B, never 'zWin'; rows halve rather than shift by 'B - 1', which
  // would underflow at B = 0 (the placeholder page table's value).
  let cellCols = 1u << cell.b;
  let tileUv = vec2<f32>(
    fract(in.uv.x * f32(cellCols)),
    fract((1.0 - in.uv.y) * f32(cellCols >> 1u))
  );

  // Half-texel clamp INSIDE the slot, in place of gutters: the atlas texel past a
  // slot's edge belongs to an unrelated tile, so an unclamped bilinear tap would
  // bleed a stranger across it. Clamping replicates the tile's own edge texel --
  // what 'clamp-to-edge' would do if every slot were its own texture.
  let slotUv =
    (vec2<f32>(f32(cell.r), f32(cell.g))
      + clamp(tileUv, vec2<f32>(TILE_HALF_TEXEL), vec2<f32>(1.0 - TILE_HALF_TEXEL)))
    * TILE_SLOT_SCALE;

  // 'textureSampleLevel', never 'textureSample'. The atlas has a single mip
  // level so there is nothing to select; it sidesteps WGSL's uniformity
  // requirement for implicit derivatives; and those derivatives would be wrong
  // anyway, because 'slotUv' jumps discontinuously at a slot boundary and
  // 'dpdx' across that jump is garbage.
  let tile = textureSampleLevel(tileAtlas, tileSampler, slotUv, 0.0);

  // Three independent reasons to show the base: page-table A (no tile, or a load
  // fade ramping), the tile's own alpha (land mask -- ocean falls through to the
  // base), and the window test. A must drive the blend, not 'tile.a' alone: the
  // placeholder atlas texel is transparent black, so a weight keyed on tile.a
  // would look right against placeholders and wrong the moment a real atlas landed.
  let tileWeight = f32(cell.a) / 255.0 * tile.a * windowMask;
  let albedo = mix(baseAlbedo, tile.rgb, tileWeight);

  // Normal map: baked nx(R)=+u=east, ny(G)=+v=north; 'perturbNormal'
  // reconstructs nz and rotates into local space (see the header). Placeholder
  // encodes (0,0,1) -> n == Ng before the map lands.
  let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
  let Ng = normalize(in.normalLocal); // renormalized -- interpolation shortens it
  let n = perturbNormal(Ng, in.tangent, nEnc);
  // View vector: 'normalLocal' doubles as the unit-sphere surface position here;
  // 'u.camPosLocal' is the camera in the same local frame.
  let v = normalize(u.camPosLocal - in.normalLocal);
  let l = u.sunDirLocal;

  // Ocean mask selects 'u.oceanRoughness' (Earth-scoped override of pbr.wesl's
  // OCEAN_ROUGHNESS) over land roughness; MIN_ROUGHNESS floors land away from the
  // GGX singularity.
  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), u.oceanRoughness, mat.g);

  let directBase = pbrDirect(n, v, l, albedo, roughness, u.f0);

  // Ground shadow (cloud deck above blocks sunlight): cast a ray from 'P', the
  // GEOMETRIC surface position (not the perturbed shading normal 'n' -- the
  // shadow follows where the point sits, not how relief tilts it), toward the
  // sun. 'P' sits inside the shell (radius ~1.002) and 'l' is already unit in the
  // local frame, so raySphere's unit-rd precondition holds and its miss sentinel
  // is provably unreachable from inside the sphere -- no miss branch needed.
  // Dimming 'direct' BEFORE the sunIrradiance scale self-limits at the
  // terminator, where direct already tends to zero.
  let P = normalize(in.normalLocal);
  let roots = raySphere(P, l, vec3<f32>(0.0), u.cloudShellRadius);
  let crossing = P + roots.y * l;
  let shadowAlpha = textureSample(cloudTexture, earthSampler, dirToEquirectUv(normalize(crossing))).a;
  let direct = directBase * (1.0 - shadowAlpha * u.cloudShadowStrength);

  let colour = direct * u.sunIrradiance + u.ambientLight * albedo;

  // City lights are EMISSIVE -- added to the lit colour, never multiplied through
  // Lambert (see 'lib/nightLights.wesl'). 'NoL' is the RAW clamped term;
  // 'nightLights' owns the terminator fade, so it must not be pre-shaped here.
  let nightColour = textureSample(nightTexture, earthSampler, in.uv).rgb;
  let NoL = max(dot(n, l), 0.0);
  // Cloud coverage at this fragment's own uv dims city lights (overcast hides
  // them from orbit); alpha 0 before the map lands makes this a no-op.
  let cloudAlphaHere = textureSample(cloudTexture, earthSampler, in.uv).a;
  let emissive = nightLights(nightColour, NoL, cloudAlphaHere);

  // Tint probe (see TILE_DEBUG). Placed at the END rather than returning early
  // beside the page-table load it probes: an early return would put the
  // remaining 'textureSample' calls after a branch, and WGSL's implicit-derivative
  // uniformity rules are not something to rely on const-folding to sidestep. At
  // 0u both arms are dead code.
  if (TILE_DEBUG == 1u) {
    // Black wherever no tile is named, so one picture carries both the tiled
    // footprint and the level bands inside it.
    let named = select(0.0, 1.0, cell.a > 0u) * windowMask;
    return vec4<f32>(debugTileLevelTint(cell.b) * named, 1.0);
  }
  if (TILE_DEBUG == 2u) {
    let probeWeight = f32(cell.a) / 255.0 * windowMask;
    return vec4<f32>(1.0 - probeWeight, probeWeight, 0.0, 1.0);
  }

  // Earth LOD overlay (the DebugPanel's 'debug.showEarthLodOverlay' toggle,
  // 'u.debugLodOverlay' > 0.5) -- a runtime, not compile-time, lens, so it
  // stays live in the shipped shader rather than compiling to dead code like
  // TILE_DEBUG's arms. 'cell.b' is the level THIS pixel is actually sampling
  // (see the "may be COARSER than zWin" note above), never 'zWin' itself.
  // "Not resident" -- no tile named at all ('cell.a == 0u', which is also the
  // pre-engage/placeholder identity) OR outside the page-table window -- gets
  // magenta rather than a ramp colour, since there is no real level to report;
  // mixed 50/50 like the ramp so the underlying geography stays legible.
  var finalColour = colour + emissive;
  if (u.debugLodOverlay > 0.5) {
    let notResident = cell.a == 0u || !inWindow;
    let overlayColour = select(earthLodOverlayColor(cell.b), vec3<f32>(1.0, 0.0, 1.0), notResident);
    finalColour = mix(finalColour, overlayColour, 0.5);
  }

  return vec4<f32>(finalColour, 1.0);
}
