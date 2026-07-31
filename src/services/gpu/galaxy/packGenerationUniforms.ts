/**
 * packGenerationUniforms — the CPU->GPU seam for galaxy generation: packs
 * one galaxy's derived scale constants, carved star/dust layouts, and every
 * value the CPU model's construction-time RNG draws would have produced,
 * into one `GENERATION_UBO`-shaped `ArrayBuffer` a compute shader (Task 3)
 * can bind directly.
 *
 * What this function does NOT do is replay a full per-star draw sequence —
 * the spike's original model drew millions of `rand()`/`randNormal()` calls
 * per galaxy (one bulge/disk/arm/halo star at a time), and a GPU compute
 * pass can't share one serial RNG stream across billions of parallel
 * invocations the way a single-threaded CPU loop can. The generation compute
 * shaders instead seed a per-invocation stateless hash from `seed` plus the
 * invocation index (see `galaxyGen/generate.wesl`'s header for the determinism
 * contract this gives up in exchange). What DOES need to come from one
 * serial draw sequence — because the spike computes them once, up front,
 * not per star — are the handful of *shared* quantities every invocation
 * reads: the bar's tilt angle, the irregular-galaxy clump centres, the
 * lenticular dust-cloud centres, and each arm's
 * phase/pitch/weight/meander/clump/wave personality. Those are exactly the
 * draws this function replicates here, CPU-side, in the spike's exact order,
 * so every invocation of the compute shaders reads the same shared geometry
 * a single serial draw sequence would have produced:
 *
 *  - `asymStream` (seeded by `asymSeed`): the four asymmetry values, then —
 *    only when arms would be built (`armStarCount > 0 && category !==
 *    'irregular'`) — seven more draws per arm (phase, pitch, weight,
 *    meanderAmp, meanderFreq, meanderPhase, fadeRadius). The `weightSum`
 *    field (stored in the arms scalar group) accumulates the weight draws
 *    from this stream, making it part of the asymmetry family even though
 *    it lives in a different field group.
 *  - `clumpStream`/`waveStream` (seeded by `clumpSeed`/`waveSeed`): four
 *    draws per arm each, under the same arms guard — scoped to their own
 *    streams so dialling one doesn't perturb the other or the asymmetry
 *    family.
 *  - `mainStream` (seeded by `seed`): the bar-tilt angle via
 *    `computeBarGeometry` (always, every category — model.js:229), then the
 *    seven irregular clump centres when `category === 'irregular'`, then
 *    the 34 lenticular cloud centres when `category === 'lenticular'`. A
 *    galaxy is only ever one category, so at most one of those two blocks
 *    actually draws; the other's array stays zero-filled, matching every
 *    other ineligible field in this packer (a population that doesn't run
 *    for this galaxy contributes no draws and no non-zero bytes, not a
 *    placeholder value).
 *
 * Every other field is a pure function of `params`/`budget` — no draw order
 * to get wrong, just the same formula the corresponding generation shader
 * population uses at its point of use.
 */
import { mulberry32 } from '../../../utils/random/mulberry32';
import { gaussian } from '../../../../tools/utils/random/gaussian';
import { carveDustLayout } from './carveDustLayout';
import { carveStarLayout } from './carveStarLayout';
import { classifyHubbleType } from './classifyHubbleType';
import { computeBarGeometry } from './computeBarGeometry';
import { grainScale } from './grainScale';
import { hiiPalette } from './hiiPalette';
import { outerRadiusOf } from './outerRadiusOf';
import { GENERATION_UBO } from './generationUboLayout';
import type { ExtraGalaxySpec } from '../../../@types/galaxy/ExtraGalaxySpec';
import type { GalaxyCategory } from '../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../@types/galaxy/GalaxyParams';
import type { StarBudget } from '../../../@types/galaxy/StarBudget';

/** `category` u32 encoding — append-only, mirrors the brief's field table. */
export const CATEGORY_CODE: Record<GalaxyCategory, number> = {
  elliptical: 0,
  lenticular: 1,
  spiral: 2,
  barred: 3,
  irregular: 4,
};

/** Write four consecutive floats starting at a vec4-aligned float index. */
function writeVec4(
  f32: Float32Array,
  offsetVec4: number,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  f32.set([x, y, z, w], offsetVec4 * 4);
}

export function packGenerationUniforms(
  params: GalaxyParams,
  budget: StarBudget,
  extra: ExtraGalaxySpec | null,
): ArrayBuffer {
  const category = classifyHubbleType(params.type);

  // --- Scale constants, per the spike's fixed geometry ratios -------------
  const outerRadius = outerRadiusOf(params);
  // 1/3.2 is the ratio every galaxy type shares; a preset that has a measured
  // radial light profile to match overrides it via `diskScaleLenFrac`.
  const diskScaleLen = outerRadius * (params.diskScaleLenFrac ?? 1 / 3.2);
  const bulgeRadius = outerRadius * 0.34 * (params.bulgeSize || 1);
  const diskHeight = 0.055 * outerRadius * (params.diskThickness || 1);
  const grain = grainScale(budget.totalStars);
  const starSize = 0.016 * outerRadius * grain;

  // --- Asymmetry stream: four construction draws, then per-arm personality
  const asymmetry = params.irregularity ?? 0.5;
  const asymStream = mulberry32(((params.asymSeed ?? 0) | 0 || 331) >>> 0);
  const flattening =
    category === 'elliptical' ? 1 - 0.09 * (parseInt(params.type.slice(1), 10) || 0) : 0.62;
  const lopsidedAmp = asymmetry * (0.06 + 0.22 * asymStream());
  const lopsidedAngle = asymStream() * Math.PI * 2;
  const bulgeAxisZ = 1 - asymmetry * (0.05 + 0.3 * asymStream());
  const bulgeAngle = asymStream() * Math.PI * 2;
  const cosBulge = Math.cos(bulgeAngle);
  const sinBulge = Math.sin(bulgeAngle);
  const bulgeConcentration = params.bulgeFalloff ?? 0.5;

  // --- Main stream: bar angle unconditionally, then category-gated centres
  const mainStream = mulberry32((params.seed ?? 0) | 0 || 1);
  const bar = computeBarGeometry(
    mainStream,
    category,
    outerRadius,
    asymmetry,
    params.barStrength,
    params.barAngleDeg,
  );

  const NUM_IRR_CLUMPS = GENERATION_UBO.arrays.clumpCenters.countVec4;
  const clumpCenters: number[][] = Array.from({ length: NUM_IRR_CLUMPS }, () => [0, 0, 0, 0]);
  if (category === 'irregular') {
    for (let c = 0; c < NUM_IRR_CLUMPS; c++) {
      const a = mainStream() * Math.PI * 2;
      const dist = outerRadius * (0.15 + 0.7 * mainStream());
      const y = gaussian(mainStream) * diskHeight * 3;
      clumpCenters[c] = [Math.cos(a) * dist * 1.1, y, Math.sin(a) * dist, 0];
    }
  }

  const LENT_CLOUDS = GENERATION_UBO.arrays.cloudCenters.countVec4;
  const cloudCenters: number[][] = Array.from({ length: LENT_CLOUDS }, () => [0, 0, 0, 0]);
  if (category === 'lenticular') {
    for (let c = 0; c < LENT_CLOUDS; c++) {
      const a = mainStream() * Math.PI * 2;
      const rr = bulgeRadius * (0.25 + 1.5 * mainStream() * mainStream());
      cloudCenters[c] = [Math.cos(a) * rr, Math.sin(a) * rr, rr, 0];
    }
  }

  // --- Arm personality: asymStream continues, clump/wave get their own ----
  const MAX_ARMS = GENERATION_UBO.arrays.armTable.countVec4 / 4;
  const numArms = Math.min(Math.max(1, Math.round(params.armCount || 2)), MAX_ARMS);

  const pitchDegrees = 8 + 26 * (params.armWinding ?? 0.5);
  const windTightness = 1 / Math.tan((pitchDegrees * Math.PI) / 180);
  const armFadeRadius = outerRadius * Math.max(0.5, 1.7 - 1.05 * (params.armFalloff ?? 0.6));
  const armFullRadius = armFadeRadius * 0.42;
  const armLengthVar = params.armEdgeVar ?? 0;

  const drawArms = budget.armStarCount > 0 && category !== 'irregular';
  const armTable: number[][] = Array.from({ length: MAX_ARMS }, () => new Array(16).fill(0));
  let weightSum = 0;

  if (drawArms) {
    const clumpStream = mulberry32(((params.clumpSeed ?? 0) | 0 || 911) >>> 0);
    const waveStream = mulberry32(((params.waveSeed ?? 0) | 0 || 777) >>> 0);
    for (let a = 0; a < numArms; a++) {
      const phase = (a / numArms) * Math.PI * 2 + (asymStream() * 2 - 1) * 0.38 * asymmetry;
      const pitch = windTightness * (1 + (asymStream() * 2 - 1) * 0.3 * asymmetry);
      const weight = 1 + (asymStream() * 2 - 1) * 0.9 * asymmetry;
      weightSum += weight;
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
      armTable[a] = [
        phase,
        pitch,
        weight,
        fadeRadius,
        meanderAmp,
        meanderFreq,
        meanderPhase,
        0,
        clumpF1,
        clumpP1,
        clumpF2,
        clumpP2,
        waveF1,
        waveP1,
        waveF2,
        waveP2,
      ];
    }
  }

  // --- Arms scalar group, shared by every arm the shader draws -------------
  const armStartRadius = Math.max(
    category === 'barred' ? bar.barLength * 0.9 : bulgeRadius * 0.55,
    bulgeRadius * 0.4,
  );
  const armWidthFactor = 0.1 * (params.armWidth ?? 1);
  const armInnerRampW = Math.max(bulgeRadius * 0.6, outerRadius * 0.14);

  // --- Dust scalar group, shared by every dust population the shader draws
  const dustAmount = params.dust ?? 1;
  const dustNoiseAmt = params.dustNoise ?? 0.6;
  const noiseFreq = (2.4 * (params.dustNoiseScale ?? 1)) / outerRadius;
  const clumpAmount = params.armClump ?? 0.5;
  const ringRadius = outerRadius * (params.dustRing ?? 0.72);
  const ringWidth = outerRadius * (params.dustRingWidth ?? 0.12);
  const ringStrength = params.dustRingStrength ?? 0;

  // --- Misc scalar group ----------------------------------------------------
  const globularSize = params.globularSize ?? 1;
  const globularBright = params.globularBright ?? 0.6;
  const youngFraction = params.youngStars ?? 0.5;
  const hiiIntensity = params.hii ?? 1;
  const irrBarOffset = outerRadius * 0.18;
  const extraScale = extra?.scale ?? 1;

  // --- Palette ---------------------------------------------------------------
  const hii = hiiPalette(params.metallicity ?? 0.5);

  // --- Warp ------------------------------------------------------------------
  const warpStrength = params.warpStrength ?? 0;
  const warpTwist = params.warpTwist ?? 0;
  const warpStartRadius = outerRadius * (params.warpStart ?? 0.3);

  // --- u32 group --------------------------------------------------------------
  const seed = ((params.seed ?? 0) | 0 || 1) >>> 0;
  const noiseSeed = (((params.seed ?? 0) | 0) ^ 0x9e3779b9) >>> 0;

  // --- Carved layouts (Task 1) -------------------------------------------------
  const starLayout = carveStarLayout(category, params, budget);
  const dustLayout = carveDustLayout(category, params, budget);

  // --- Write ---------------------------------------------------------------
  const buf = new ArrayBuffer(GENERATION_UBO.byteLength);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  const F = GENERATION_UBO.f32;
  const U = GENERATION_UBO.u32;
  const A = GENERATION_UBO.arrays;

  f32[F.outerRadius] = outerRadius;
  f32[F.diskScaleLen] = diskScaleLen;
  f32[F.bulgeRadius] = bulgeRadius;
  f32[F.diskHeight] = diskHeight;
  f32[F.grainScale] = grain;
  f32[F.starSize] = starSize;

  f32[F.flattening] = flattening;
  f32[F.asymmetry] = asymmetry;
  f32[F.lopsidedAmp] = lopsidedAmp;
  f32[F.lopsidedAngle] = lopsidedAngle;
  f32[F.bulgeAxisZ] = bulgeAxisZ;
  f32[F.cosBulge] = cosBulge;
  f32[F.sinBulge] = sinBulge;
  f32[F.bulgeConcentration] = bulgeConcentration;

  f32[F.barLength] = bar.barLength;
  f32[F.cosBar] = bar.cosBar;
  f32[F.sinBar] = bar.sinBar;

  f32[F.warpStrength] = warpStrength;
  f32[F.warpTwist] = warpTwist;
  f32[F.warpStartRadius] = warpStartRadius;

  f32[F.dustAmount] = dustAmount;
  f32[F.dustNoiseAmt] = dustNoiseAmt;
  f32[F.noiseFreq] = noiseFreq;
  f32[F.clumpAmount] = clumpAmount;
  f32[F.ringRadius] = ringRadius;
  f32[F.ringWidth] = ringWidth;
  f32[F.ringStrength] = ringStrength;

  f32[F.subArmAmount] = params.subArms ?? 0;
  f32[F.waveAmount] = params.armWave ?? 0;
  f32[F.armStartRadius] = armStartRadius;
  f32[F.armWidthFactor] = armWidthFactor;
  f32[F.armFullRadius] = armFullRadius;
  f32[F.armInnerRampW] = armInnerRampW;
  f32[F.weightSum] = weightSum;

  f32[F.globularSize] = globularSize;
  f32[F.globularBright] = globularBright;
  f32[F.youngFraction] = youngFraction;
  f32[F.hiiIntensity] = hiiIntensity;
  f32[F.irrBarOffset] = irrBarOffset;
  f32[F.extraScale] = extraScale;

  writeVec4(f32, A.hiiCore.offsetVec4, hii.core[0], hii.core[1], hii.core[2], 0);
  writeVec4(f32, A.hiiHalo.offsetVec4, hii.halo[0], hii.halo[1], hii.halo[2], 0);

  const pos = extra?.pos ?? [0, 0, 0];
  writeVec4(f32, A.extraPos.offsetVec4, pos[0], pos[1], pos[2], 0);
  const rotY = extra?.rotY ?? 0;
  const tiltX = extra?.tiltX ?? 0;
  writeVec4(
    f32,
    A.extraRot.offsetVec4,
    Math.cos(rotY),
    Math.sin(rotY),
    Math.cos(tiltX),
    Math.sin(tiltX),
  );

  u32[U.seed] = seed;
  u32[U.noiseSeed] = noiseSeed;
  u32[U.category] = CATEGORY_CODE[category];
  u32[U.numArms] = numArms;
  u32[U.starCapacity] = starLayout.capacity;
  u32[U.dustCapacity] = dustLayout.capacity;
  u32[U.starRangeCount] = starLayout.ranges.length;
  u32[U.dustRangeCount] = dustLayout.ranges.length;

  const armBase = A.armTable.offsetVec4 * 4;
  for (let a = 0; a < MAX_ARMS; a++) f32.set(armTable[a]!, armBase + a * 16);

  const clumpBase = A.clumpCenters.offsetVec4 * 4;
  for (let c = 0; c < NUM_IRR_CLUMPS; c++) f32.set(clumpCenters[c]!, clumpBase + c * 4);

  const cloudBase = A.cloudCenters.offsetVec4 * 4;
  for (let c = 0; c < LENT_CLOUDS; c++) f32.set(cloudCenters[c]!, cloudBase + c * 4);

  const starRangesBase = A.starRanges.offsetVec4 * 4;
  for (let i = 0; i < A.starRanges.countVec4; i++) {
    const r = starLayout.ranges[i];
    u32.set(r ? [r.start, r.iterations, r.stride, r.popId] : [0, 0, 0, 0], starRangesBase + i * 4);
  }

  const dustRangesBase = A.dustRanges.offsetVec4 * 4;
  for (let i = 0; i < A.dustRanges.countVec4; i++) {
    const r = dustLayout.ranges[i];
    u32.set(r ? [r.start, r.iterations, r.stride, r.popId] : [0, 0, 0, 0], dustRangesBase + i * 4);
  }

  return buf;
}
