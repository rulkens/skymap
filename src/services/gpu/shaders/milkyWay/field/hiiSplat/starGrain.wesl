// hiiSplat/starGrain.wesl — the YOUNG STARS chain's own point-grain
// texture: three band-limited octaves of a baked scattered-point volume
// (starGrainBake.wesl), giving an association splat many independent
// unresolved stars rather than the shared ridged ISM texture hiiNoise.wesl
// gives shells/DIG. Moved verbatim from splat.wesl (#78's per-splat-type
// split) — see that file's git history for the calibration narrative.

import package::milkyWay::field::io::u;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;
import package::milkyWay::field::io::starGrainTex;
import package::milkyWay::field::io::starGrainSmp;

// One full wrap of starGrainBake.wesl's baked volume, sized so several of
// its 32 lattice cells cross one YOUNG STARS splat's own sigma — several
// independent grains per splat, not one grain spanning several. Fixed, not
// tunable: unlike dustNoise.x this volume has no matching live parameter.
const STAR_GRAIN_TILE_UNITS: f32 = 0.64;
// Compensates the bake's own sparsity (spatial mean well under 1) back up
// toward mean ~1 — eyeballed from the bake's own density/sigma/amplitude,
// so turning a group's Texture weight up reveals grain without discounting
// that group's calibrated total flux.
const STAR_GRAIN_GAIN: f32 = 8.0;
// Zoom-revealed octaves sample the SAME volume at 4x/16x the base tiling
// frequency — far enough apart that each reads as its own point generation.
const STAR_GRAIN_OCTAVE1_DIV: f32 = 4.0;
const STAR_GRAIN_OCTAVE2_DIV: f32 = 16.0;

// Domain-warp period (world units) of the low-frequency shift applied
// before all three octave taps — fixes a long chain visibly repeating the
// same constellation every STAR_GRAIN_TILE_UNITS. 0.64 x (2 + phi), NOT a
// round multiple: the composite pattern repeats at the LCM of warp and tile
// periods, and the old 2.24 = 7/2 tiles cycled just 7 distinct warped
// constellations (and integer-locked the /4 and /16 octaves at 14x/56x).
// A golden-ratio multiple is worst-approximable by small fractions, so the
// tile phases equidistribute and never cycle — merely "non-integer" is not
// enough, commensurate ratios with small denominators still lock.
const STAR_GRAIN_WARP_SCALE: f32 = 0.64 * 3.6180339887;
// Warp displacement amplitude — u.perf.y (render.starGrainWarpAmp, world
// units, io.wesl's own doc): large enough to break the repeat, small enough
// to stay under one tile (shredding starts ~1x). Live, not const, since an
// A/B against warp-off (which brought the tile repeat straight back) showed
// warp has to stay on, but the amplitude itself is a look call.

// The firefly-fix gate below tracks the baked POINT's visible extent, not
// the tile: starGrainBake.wesl's points sit at sigma POINT_SIGMA_CELLS=0.28
// cell-widths (CELLS=32), an order of magnitude under the tile. The gate's
// feature size is a multiple of that sigma — u.dustDetail.w
// (render.starGrainFeatureScale), the user's own live calibration.
const STAR_GRAIN_POINT_SIGMA_FRAC: f32 = 0.28 / 32.0;

// starGrainOctave — one tap of the baked volume, half-tile-offset (per
// dustMap.wesl's S4 breakup precedent) so a finer octave doesn't just
// resample its coarser sibling enlarged. 'contrast' sharpens the baked
// field's spike/background contrast via pow(); GAIN restores mean ~1.
fn starGrainOctave(p: vec3<f32>, tileUnits: f32, contrast: f32, offset: vec3<f32>) -> f32 {
  let n = textureSampleLevel(starGrainTex, starGrainSmp, p / tileUnits + offset, 0.0).x;
  return pow(n, max(contrast, 1e-4)) * STAR_GRAIN_GAIN;
}

// starGrainTerm — hiiNoise.wesl's counterpart for the YOUNG STARS branch:
// samples the scattered, uncorrelated point-grain volume instead of the
// shared ridged fbm. Two finer octaves (tileUnits/4, /16) layer on the base
// tap so zooming in resolves smaller points instead of the base grain
// enlarging into a blob — all three mean-1 multiplicative, mixed toward 1
// never 0, each gated by its own octaveNWeight = clamp(tileUnitsN *
// featureFrac / (2*pxWorld) - 1, 0, 1). This is the firefly fix: at a
// reduced target divisor pxWorld grows, so grain points cross below the
// ~2px floor and the weight fades to neutral before sub-pixel points can
// alias into sparks — weight <= 0 skips its own texture fetch outright.
//
// pWarped displaces the lookup ONCE, shared by all three octaves (warping
// each independently would drift them apart and break the half-tile
// decorrelation between them). Reuses dustNoiseTex's rgba8unorm ridged
// bands (already bound for hiiNoiseTerm) as a free vec3 displacement, mean
// 0.5 per band hence the '- 0.5' recentring — built from the UNSCALED p so
// the Texture-scale slider zooms the grain without re-randomizing the shift.
fn starGrainTerm(p: vec3<f32>, depth: f32, scale: f32, contrast: f32) -> f32 {
  let pxWorld = 2.0 * depth * u.params.x / u.counts2.w;
  let featureFrac = max(u.dustDetail.w, 0.0) * STAR_GRAIN_POINT_SIGMA_FRAC;

  let tileUnits0 = STAR_GRAIN_TILE_UNITS / max(scale, 1e-4);
  let tileUnits1 = tileUnits0 / STAR_GRAIN_OCTAVE1_DIV;
  let tileUnits2 = tileUnits0 / STAR_GRAIN_OCTAVE2_DIV;

  // pxWorld <= 0 (degenerate depth): every octave stays fully weighted
  // rather than guessing at a resolution it can't see.
  var octave0Weight = 1.0;
  var octave1Weight = 1.0;
  var octave2Weight = 1.0;
  if (pxWorld > 0.0) {
    octave0Weight = clamp(tileUnits0 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
    octave1Weight = clamp(tileUnits1 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
    octave2Weight = clamp(tileUnits2 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  }

  var term = 1.0;
  if (octave0Weight <= 0.0 && octave1Weight <= 0.0 && octave2Weight <= 0.0) {
    return term;
  }

  let warpN = textureSampleLevel(dustNoiseTex, dustNoiseSmp, p / STAR_GRAIN_WARP_SCALE, 0.0).xyz;
  let pWarped = p + u.perf.y * (warpN - vec3<f32>(0.5));

  if (octave0Weight > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits0, contrast, vec3<f32>(0.0)), octave0Weight);
  }
  if (octave1Weight > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits1, contrast, vec3<f32>(0.5)), octave1Weight);
  }
  if (octave2Weight > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits2, contrast, vec3<f32>(0.5)), octave2Weight);
  }

  return term;
}
