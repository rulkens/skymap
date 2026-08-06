/**
 * describeGalaxy — one `GalaxyParams` preset in, one `GalaxyDescription` out:
 * the derived lengths, the population light split, and every construction-time
 * RNG draw a galaxy has. Both tiers read the result; neither draws.
 *
 * The draw order below is the contract. `randomGalaxyParams` and every seeded
 * preset are pinned to it, so reordering a draw, adding one, or skipping one
 * rerolls every galaxy in the gallery. A pinned value (`barAngleDeg`,
 * `armAges[a]`) still CONSUMES its draw and throws it away for that reason.
 */
import { lerp } from '../../../../utils/math/lerp';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import { normalizeGenerationSeed } from '../../../../utils/galaxy/normalizeGenerationSeed';
import { gaussian } from '../../../../../tools/utils/random/gaussian';
import { classifyHubbleType } from './classifyHubbleType';
import { computeBarGeometry } from './computeBarGeometry';
import { galaxyLightDecomposition } from './galaxyLightDecomposition';
import { hiiPalette } from './hiiPalette';
import { outerRadiusOf } from './outerRadiusOf';
import { GENERATION_UBO } from './generationUboLayout';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Per-arm age bands: alternating old/young by parity, each with its own
 * jitter range, so a 4-arm galaxy naturally lands two old arms roughly
 * opposite two young ones rather than a uniform contrast on every arm.
 */
const ARM_AGE_EVEN_BASE = 0.7;
const ARM_AGE_ODD_BASE = 0.1;
const ARM_AGE_JITTER_RANGE = 0.3;

/**
 * Total emitted light per unit disc area — a GAUGE for the field's arbitrary
 * flux units, not a measurement. Pinned so the Milky Way preset emits exactly
 * what it did before either sprite term left the flux path; repin it and every
 * tuned `analyticExposure` moves with it. What the number MEANS is on
 * `GalaxyDescription.luminosity`.
 *
 * 7.4268687 (the sprite-budget anchor's own value) x 1.155747, the MW's old
 * sum(count share x SPRITE_POPULATION_BRIGHTNESS) — 0.246x0.85 + 0.15834x0.9 +
 * 0.59566x1.35 — which is the per-galaxy factor the population multipliers
 * used to contribute and the decomposition now leaves at exactly 1.
 */
const GALAXY_LUMINOSITY_PER_AREA = 8.5835812;

/**
 * How far the arms reach, in units of `outerRadius`, lerped by `armFalloff`
 * (0 = longest, 1 = shortest; the default 0.6 lands at 1.07). This is the
 * ONLY knob that moves where an arm ends — `arms.excessScaleRatio` shapes its
 * brightness inside this extent and cannot lengthen it.
 *
 * The floor is unreachable from the 0..1 slider, whose shortest arm is 0.65:
 * it guards the preset-JSON path, which `parseGalaxyPreset` deliberately
 * leaves unvalidated, from an armFalloff past ~1.14 zeroing every radius the
 * arm chain divides by.
 */
const ARM_EXTENT_AT_FALLOFF_0 = 1.7;
const ARM_EXTENT_AT_FALLOFF_1 = 0.65;
const ARM_EXTENT_FLOOR = 0.5;

/**
 * How many arms / clumps / clouds the model has. They live on the generation
 * UBO because that is the buffer that has to reserve room for them; they are
 * model constants all the same, and the loop bounds below must match or the
 * draw sequence moves.
 */
const MAX_ARMS = GENERATION_UBO.arrays.armTable.countVec4 / 4;
const IRREGULAR_CLUMPS = GENERATION_UBO.arrays.clumpCenters.countVec4;
const LENTICULAR_CLOUDS = GENERATION_UBO.arrays.cloudCenters.countVec4;

const ZERO_ARM = (): GalaxyFieldArmRecord => ({
  phase: 0,
  pitch: 0,
  weight: 0,
  fadeRadius: 0,
  meanderAmp: 0,
  meanderFreq: 0,
  meanderPhase: 0,
  age: 0,
  clumpF1: 0,
  clumpP1: 0,
  clumpF2: 0,
  clumpP2: 0,
  waveF1: 0,
  waveP1: 0,
  waveF2: 0,
  waveP2: 0,
});

export function describeGalaxy(params: GalaxyParams): GalaxyDescription {
  const category = classifyHubbleType(params.type);

  const outerRadius = outerRadiusOf(params);
  // 1/3.2 is the ratio every galaxy type shares; a preset that has a measured
  // radial light profile to match overrides it via `diskScaleLenFrac`.
  const diskScaleLen = outerRadius * (params.shared.diskScaleLenFrac ?? 1 / 3.2);
  const bulgeRadius = outerRadius * 0.34 * (params.shared.bulgeSize || 1);
  const diskHeight = 0.055 * outerRadius * (params.shared.diskThickness || 1);

  // --- Asymmetry stream: four draws, then per-arm personality further down --
  const asymmetry = params.shared.irregularity ?? 0.5;
  const asymStream = mulberry32(((params.shared.asymSeed ?? 0) | 0 || 331) >>> 0);
  const flattening =
    category === 'elliptical' ? 1 - 0.09 * (parseInt(params.type.slice(1), 10) || 0) : 0.62;
  const lopsidedAmp = asymmetry * (0.06 + 0.22 * asymStream());
  const lopsidedAngle = asymStream() * Math.PI * 2;
  const bulgeAxisZ = 1 - asymmetry * (0.05 + 0.3 * asymStream());
  const bulgeTiltRad = asymStream() * Math.PI * 2;

  // --- Main stream: bar angle unconditionally, then category-gated centres ---
  const mainStream = mulberry32(normalizeGenerationSeed(params.shared.seed));
  const bar = computeBarGeometry(
    mainStream,
    category,
    outerRadius,
    asymmetry,
    params.shared.barStrength,
    params.shared.barAngleDeg,
  );

  const irregularClumpCenters: Vec3[] = [];
  if (category === 'irregular') {
    for (let c = 0; c < IRREGULAR_CLUMPS; c++) {
      const a = mainStream() * Math.PI * 2;
      const dist = outerRadius * (0.15 + 0.7 * mainStream());
      const y = gaussian(mainStream) * diskHeight * 3;
      irregularClumpCenters.push([Math.cos(a) * dist * 1.1, y, Math.sin(a) * dist]);
    }
  }

  const lenticularCloudCenters: Vec3[] = [];
  if (category === 'lenticular') {
    for (let c = 0; c < LENTICULAR_CLOUDS; c++) {
      const a = mainStream() * Math.PI * 2;
      const rr = bulgeRadius * (0.25 + 1.5 * mainStream() * mainStream());
      lenticularCloudCenters.push([Math.cos(a) * rr, Math.sin(a) * rr, rr]);
    }
  }

  // --- Arm personality: asymStream continues, clump/wave get their own ------
  const numArms = Math.min(Math.max(1, Math.round(params.shared.armCount || 2)), MAX_ARMS);

  const pitchDegrees = 8 + 26 * (params.shared.armWinding ?? 0.5);
  const windTightness = 1 / Math.tan((pitchDegrees * Math.PI) / 180);
  const armExtentFrac = lerp(
    ARM_EXTENT_AT_FALLOFF_0,
    ARM_EXTENT_AT_FALLOFF_1,
    params.shared.armFalloff ?? 0.6,
  );
  const armFadeRadius = outerRadius * Math.max(ARM_EXTENT_FLOOR, armExtentFrac);
  const armFullRadius = armFadeRadius * 0.42;
  const armLengthVar = params.shared.armEdgeVar ?? 0;

  // `arms` is always `numArms` long. A category that draws none — every
  // elliptical and lenticular, and every irregular — gets zeroed records
  // rather than a short array, because a zero-weight arm is what v1's
  // arm table and v2's ridge chain both already read for it.
  //
  // The category alone decides. `armStrength` spends STARS on arms a spiral
  // already has, so gating on its count lets a sprite budget of zero delete
  // the field's arm ridges, its SF events and its HII regions along with the
  // sprites.
  const arms: GalaxyFieldArmRecord[] = Array.from({ length: numArms }, () => ZERO_ARM());
  if (category === 'spiral' || category === 'barred') {
    const clumpStream = mulberry32(((params.shared.clumpSeed ?? 0) | 0 || 911) >>> 0);
    const waveStream = mulberry32(((params.shared.waveSeed ?? 0) | 0 || 777) >>> 0);
    for (let a = 0; a < numArms; a++) {
      const phase = (a / numArms) * Math.PI * 2 + (asymStream() * 2 - 1) * 0.38 * asymmetry;
      const pitch = windTightness * (1 + (asymStream() * 2 - 1) * 0.3 * asymmetry);
      const weight = 1 + (asymStream() * 2 - 1) * 0.9 * asymmetry;
      const meanderAmp = asymmetry * (0.05 + 0.14 * asymStream());
      const meanderFreq = 1.2 + 1.6 * asymStream();
      const meanderPhase = asymStream() * Math.PI * 2;
      const clumpF1 = 2 + 4 * clumpStream();
      const clumpP1 = clumpStream() * Math.PI * 2;
      const clumpF2 = 5 + 6 * clumpStream();
      const clumpP2 = clumpStream() * Math.PI * 2;
      const waveF1 = 3 + 4 * waveStream();
      const waveP1 = waveStream() * Math.PI * 2;
      const waveF2 = 8 + 8 * waveStream();
      const waveP2 = waveStream() * Math.PI * 2;
      const fadeRadius = Math.max(
        armFullRadius * 1.3,
        armFadeRadius * (1 + (asymStream() * 2 - 1) * 0.55 * armLengthVar),
      );
      const ageJitter = asymStream();
      const ageBase = a % 2 === 0 ? ARM_AGE_EVEN_BASE : ARM_AGE_ODD_BASE;
      const age = params.shared.armAges?.[a] ?? ageBase + ARM_AGE_JITTER_RANGE * ageJitter;
      arms[a] = {
        phase,
        pitch,
        weight,
        fadeRadius,
        meanderAmp,
        meanderFreq,
        meanderPhase,
        age,
        clumpF1,
        clumpP1,
        clumpF2,
        clumpP2,
        waveF1,
        waveP1,
        waveF2,
        waveP2,
      };
    }
  }

  return {
    category,
    // Globular clusters are outside the split entirely — 90-star knots at
    // random radii are not a smooth field.
    light: galaxyLightDecomposition(category, params),
    luminosity: GALAXY_LUMINOSITY_PER_AREA * outerRadius * outerRadius,
    outerRadius,
    diskScaleLen,
    bulgeRadius,
    diskHeight,
    flattening,
    asymmetry,
    lopsidedAmp,
    lopsidedAngle,
    bulgeAxisZ,
    bulgeTiltRad,
    bulgeConcentration: params.shared.bulgeFalloff ?? 0.5,
    barLength: bar.barLength,
    barTiltRad: bar.barTiltRad,
    warpStrength: params.shared.warpStrength ?? 0,
    warpTwist: params.shared.warpTwist ?? 0,
    warpStartRadius: outerRadius * (params.shared.warpStart ?? 0.3),
    numArms,
    armStartRadius:
      Math.max(
        category === 'barred' ? bar.barLength * 0.9 : bulgeRadius * 0.55,
        bulgeRadius * 0.4,
      ) * (params.shared.armStart ?? 1),
    armInnerRampW: Math.max(bulgeRadius * 0.6, outerRadius * 0.14),
    armFullRadius,
    armWidthFactor: 0.1 * (params.legacy?.armWidth ?? 1),
    waveAmount: params.shared.armWave ?? 0,
    clumpAmount: params.shared.armClump ?? 0.5,
    youngFraction: params.shared.youngStars ?? 0.5,
    hiiPalette: hiiPalette(params.shared.metallicity ?? 0.5),
    arms,
    irregularClumpCenters,
    lenticularCloudCenters,
    seed: normalizeGenerationSeed(params.shared.seed) >>> 0,
  };
}
