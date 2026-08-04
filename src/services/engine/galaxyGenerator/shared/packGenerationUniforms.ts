/**
 * packGenerationUniforms — the CPU->GPU seam for galaxy generation: writes one
 * `GalaxyDescription`, the carved star/dust layouts, and v1's own sprite knobs
 * into one `GENERATION_UBO`-shaped `ArrayBuffer` a compute shader binds
 * directly.
 *
 * It draws nothing. Every shared quantity a serial RNG produced — bar and
 * bulge tilt, lopsidedness, clump/cloud centres, per-arm personality — arrives
 * in the description, because the analytic field has to read the same values
 * and a second draw sequence would misalign the two tiers (`describeGalaxy`).
 *
 * The generation shaders do NOT replay a per-star draw sequence: they seed a
 * stateless per-invocation hash from `seed` plus the invocation index (see
 * `galaxyGen/generate.wesl`'s header). Only the shared, drawn-once quantities
 * above need a serial stream, which is exactly what the description carries.
 */
import { carveDustLayout } from './carveDustLayout';
import { carveStarLayout } from './carveStarLayout';
import { grainScale } from './grainScale';
import { GENERATION_UBO } from './generationUboLayout';
import type { ExtraGalaxySpec } from '../../../../@types/galaxy/ExtraGalaxySpec';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { StarBudget } from '../../../../@types/galaxy/StarBudget';

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
  description: GalaxyDescription,
  /** v1-only knobs the description deliberately does not carry: dust ring/noise, globulars, extraScale. */
  params: GalaxyParams,
  budget: StarBudget,
  extra: ExtraGalaxySpec | null,
): ArrayBuffer {
  const { category, outerRadius } = description;
  const starLayout = carveStarLayout(category, params, budget);
  const dustLayout = carveDustLayout(category, params, budget);

  const buf = new ArrayBuffer(GENERATION_UBO.byteLength);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  const F = GENERATION_UBO.f32;
  const U = GENERATION_UBO.u32;
  const A = GENERATION_UBO.arrays;

  f32[F.outerRadius] = outerRadius;
  f32[F.diskScaleLen] = description.diskScaleLen;
  f32[F.bulgeRadius] = description.bulgeRadius;
  f32[F.diskHeight] = description.diskHeight;
  f32[F.grainScale] = grainScale(budget.totalStars);
  f32[F.starSize] = description.starSize;

  f32[F.flattening] = description.flattening;
  f32[F.asymmetry] = description.asymmetry;
  f32[F.lopsidedAmp] = description.lopsidedAmp;
  f32[F.lopsidedAngle] = description.lopsidedAngle;
  f32[F.bulgeAxisZ] = description.bulgeAxisZ;
  f32[F.cosBulge] = Math.cos(description.bulgeTiltRad);
  f32[F.sinBulge] = Math.sin(description.bulgeTiltRad);
  f32[F.bulgeConcentration] = description.bulgeConcentration;

  f32[F.barLength] = description.barLength;
  f32[F.cosBar] = Math.cos(description.barTiltRad);
  f32[F.sinBar] = Math.sin(description.barTiltRad);

  f32[F.warpStrength] = description.warpStrength;
  f32[F.warpTwist] = description.warpTwist;
  f32[F.warpStartRadius] = description.warpStartRadius;

  // --- Dust: shape shared with the description, amounts v1's alone ---------
  f32[F.dustAmount] = params.spriteDust ?? 1;
  f32[F.dustNoiseAmt] = params.dustNoise ?? 0.6;
  f32[F.noiseFreq] = (2.4 * (params.dustNoiseScale ?? 1)) / outerRadius;
  f32[F.clumpAmount] = description.clumpAmount;
  f32[F.ringRadius] = outerRadius * (params.dustRing ?? 0.72);
  f32[F.ringWidth] = outerRadius * (params.dustRingWidth ?? 0.12);
  f32[F.ringStrength] = params.dustRingStrength ?? 0;

  f32[F.subArmAmount] = params.subArms ?? 0;
  f32[F.waveAmount] = description.waveAmount;
  f32[F.armStartRadius] = description.armStartRadius;
  f32[F.armWidthFactor] = description.armWidthFactor;
  f32[F.armFullRadius] = description.armFullRadius;
  f32[F.armInnerRampW] = description.armInnerRampW;
  f32[F.weightSum] = description.arms.reduce((sum, arm) => sum + arm.weight, 0);

  f32[F.globularSize] = params.globularSize ?? 1;
  f32[F.globularBright] = params.globularBright ?? 0.6;
  f32[F.youngFraction] = description.youngFraction;
  f32[F.hiiIntensity] = params.hii ?? 1;
  f32[F.irrBarOffset] = outerRadius * 0.18;
  f32[F.extraScale] = extra?.scale ?? 1;

  const hii = description.hiiPalette;
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

  u32[U.seed] = description.seed;
  u32[U.noiseSeed] = (((params.seed ?? 0) | 0) ^ 0x9e3779b9) >>> 0;
  u32[U.category] = CATEGORY_CODE[category];
  u32[U.numArms] = description.numArms;
  u32[U.starCapacity] = starLayout.capacity;
  u32[U.dustCapacity] = dustLayout.capacity;
  u32[U.starRangeCount] = starLayout.ranges.length;
  u32[U.dustRangeCount] = dustLayout.ranges.length;

  // Lane order below is hand-mirrored into `generate.wesl`'s ArmRec — a
  // reorder here lands a float in the wrong lane with no error anywhere.
  const armBase = A.armTable.offsetVec4 * 4;
  description.arms.forEach((arm, index) => {
    f32.set(
      [
        arm.phase,
        arm.pitch,
        arm.weight,
        arm.fadeRadius,
        arm.meanderAmp,
        arm.meanderFreq,
        arm.meanderPhase,
        arm.age,
        arm.clumpF1,
        arm.clumpP1,
        arm.clumpF2,
        arm.clumpP2,
        arm.waveF1,
        arm.waveP1,
        arm.waveF2,
        arm.waveP2,
      ],
      armBase + index * 16,
    );
  });

  const clumpBase = A.clumpCenters.offsetVec4 * 4;
  description.irregularClumpCenters.forEach((c, index) => {
    f32.set([c[0], c[1], c[2], 0], clumpBase + index * 4);
  });

  const cloudBase = A.cloudCenters.offsetVec4 * 4;
  description.lenticularCloudCenters.forEach((c, index) => {
    f32.set([c[0], c[1], c[2], 0], cloudBase + index * 4);
  });

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
