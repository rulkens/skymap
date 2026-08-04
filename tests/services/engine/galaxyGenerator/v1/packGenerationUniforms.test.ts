/**
 * packGenerationUniforms — pins the generation UBO's byte layout (via
 * `GENERATION_UBO`, the single offset authority — every lookup below reads
 * through it rather than a literal index) and its draw-stream determinism
 * contract: `asymSeed`/`clumpSeed`/`waveSeed` are independent RNG streams,
 * so rerolling one must change only that stream's own lanes, never another
 * stream's. That family-isolation property is what lets a UI seed-dice
 * button perturb "arm clumpiness" without silently reshuffling the bar
 * angle, the disk scale, or any other unrelated field.
 */
import { describe, expect, it } from 'vitest';
import { GENERATION_UBO } from '../../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import { packGenerationUniforms } from '../../../../../src/services/engine/galaxyGenerator/v1/packGenerationUniforms';
import { carveDustLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveDustLayout';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { grainScale } from '../../../../../src/services/engine/galaxyGenerator/v1/grainScale';
import { hiiPalette } from '../../../../../src/services/engine/galaxyGenerator/shared/hiiPalette';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/** Derive arm-table geometry from GENERATION_UBO's layout (the single authority). */
const MAX_ARMS =
  GENERATION_UBO.arrays.armTable.countVec4 / GENERATION_UBO.armTableLayout.strideVec4;
const ARM_STRIDE = GENERATION_UBO.armTableLayout.strideVec4 * 4; // vec4 slots to floats

/** Every float index a full arm-table record spans, split by which stream draws it. */
const ARM_ASYM_LANES = GENERATION_UBO.armTableLayout.asymLanes;
const ARM_CLUMP_LANES = GENERATION_UBO.armTableLayout.clumpLanes;
const ARM_WAVE_LANES = GENERATION_UBO.armTableLayout.waveLanes;

function armTableIndices(lanes: readonly number[]): Set<number> {
  const base = GENERATION_UBO.arrays.armTable.offsetVec4 * 4;
  const indices = new Set<number>();
  for (let arm = 0; arm < MAX_ARMS; arm++) {
    for (const lane of lanes) indices.add(base + arm * ARM_STRIDE + lane);
  }
  return indices;
}

/** Every f32 index that changed between two same-length Float32Arrays. */
function diffIndices(a: Float32Array, b: Float32Array): number[] {
  const changed: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed.push(i);
  return changed;
}

/** The whole front-end in one call, since every case below packs a preset. */
function pack(params: GalaxyParams, extra: ExtraGalaxySpec | null = null): ArrayBuffer {
  const budget = splitStarBudget(classifyHubbleType(params.type), params);
  return packGenerationUniforms(describeGalaxy(params), params, budget, extra);
}

const SPIRAL_PARAMS: GalaxyParams = {
  type: 'Sb',
  starCount: 100000,
  seed: 5,
  asymSeed: 1,
  clumpSeed: 2,
  waveSeed: 3,
};

describe('packGenerationUniforms', () => {
  it('byteLength is 16-aligned and matches the layout const', () => {
    const buf = pack(SPIRAL_PARAMS);
    expect(buf.byteLength).toBe(GENERATION_UBO.byteLength);
    expect(buf.byteLength % 16).toBe(0);
  });

  it('derived scale constants land at their offsets', () => {
    const params: GalaxyParams = { type: 'Sb', starCount: 100000, radius: 2 };
    const budget = splitStarBudget(classifyHubbleType(params.type), params);
    const f32 = new Float32Array(pack(params));

    // radius: 2 -> outerRadius = 10 * 2 = 20; diskScaleLen = 20 / 3.2 = 6.25.
    expect(f32[GENERATION_UBO.f32.outerRadius]).toBeCloseTo(20, 6);
    expect(f32[GENERATION_UBO.f32.diskScaleLen]).toBeCloseTo(6.25, 6);

    // Float32 truncation is expected once starSize round-trips through the
    // packed buffer, so compare with tolerance rather than exact equality
    // (same rationale as packCloudUniforms.test.ts's params assertions).
    const grain = grainScale(budget.totalStars);
    expect(f32[GENERATION_UBO.f32.starSize]).toBeCloseTo(0.016 * 20 * grain, 6);
  });

  it('same params produce identical bytes', () => {
    const a = pack(SPIRAL_PARAMS);
    const b = pack({ ...SPIRAL_PARAMS });
    expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
  });

  it('asymSeed reroll changes only asymmetry-family fields', () => {
    const a = new Float32Array(pack(SPIRAL_PARAMS));
    const b = new Float32Array(pack({ ...SPIRAL_PARAMS, asymSeed: 99 }));

    const allowed = new Set<number>([
      ...armTableIndices(ARM_ASYM_LANES),
      GENERATION_UBO.f32.flattening,
      GENERATION_UBO.f32.asymmetry,
      GENERATION_UBO.f32.lopsidedAmp,
      GENERATION_UBO.f32.lopsidedAngle,
      GENERATION_UBO.f32.bulgeAxisZ,
      GENERATION_UBO.f32.cosBulge,
      GENERATION_UBO.f32.sinBulge,
      GENERATION_UBO.f32.bulgeConcentration,
      // weightSum sums the per-arm weights the asym stream draws, so it is
      // legitimately part of this family even though it lives in the "arms"
      // scalar group rather than "asymmetry" (see spiralArms.ts:102-103).
      GENERATION_UBO.f32.weightSum,
    ]);

    const changed = diffIndices(a, b);
    expect(changed.length).toBeGreaterThan(0);
    for (const index of changed) expect(allowed.has(index)).toBe(true);
  });

  it('clumpSeed reroll changes only the armTable clump lanes', () => {
    const a = new Float32Array(pack(SPIRAL_PARAMS));
    const b = new Float32Array(pack({ ...SPIRAL_PARAMS, clumpSeed: 777 }));

    const allowed = armTableIndices(ARM_CLUMP_LANES);
    const changed = diffIndices(a, b);
    expect(changed.length).toBeGreaterThan(0);
    for (const index of changed) expect(allowed.has(index)).toBe(true);
  });

  it('waveSeed reroll changes only the armTable wave lanes', () => {
    const a = new Float32Array(pack(SPIRAL_PARAMS));
    const b = new Float32Array(pack({ ...SPIRAL_PARAMS, waveSeed: 888 }));

    const allowed = armTableIndices(ARM_WAVE_LANES);
    const changed = diffIndices(a, b);
    expect(changed.length).toBeGreaterThan(0);
    for (const index of changed) expect(allowed.has(index)).toBe(true);
  });

  it('null extra packs the identity transform', () => {
    const f32 = new Float32Array(pack(SPIRAL_PARAMS));

    const posBase = GENERATION_UBO.arrays.extraPos.offsetVec4 * 4;
    expect(Array.from(f32.slice(posBase, posBase + 4))).toEqual([0, 0, 0, 0]);
    expect(f32[GENERATION_UBO.f32.extraScale]).toBe(1);

    const rotBase = GENERATION_UBO.arrays.extraRot.offsetVec4 * 4;
    expect(Array.from(f32.slice(rotBase, rotBase + 4))).toEqual([1, 0, 1, 0]);
  });

  it('an ExtraGalaxySpec packs pos, scale and the cos/sin of rotY and tiltX', () => {
    const extra: ExtraGalaxySpec = {
      params: SPIRAL_PARAMS,
      pos: [3, 4, 5],
      scale: 2,
      rotY: Math.PI / 6,
      tiltX: Math.PI / 4,
    };
    const f32 = new Float32Array(pack(SPIRAL_PARAMS, extra));

    const posBase = GENERATION_UBO.arrays.extraPos.offsetVec4 * 4;
    expect(f32[posBase]).toBeCloseTo(3, 6);
    expect(f32[posBase + 1]).toBeCloseTo(4, 6);
    expect(f32[posBase + 2]).toBeCloseTo(5, 6);
    expect(f32[GENERATION_UBO.f32.extraScale]).toBeCloseTo(2, 6);

    const rotBase = GENERATION_UBO.arrays.extraRot.offsetVec4 * 4;
    expect(f32[rotBase]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(f32[rotBase + 1]).toBeCloseTo(Math.sin(Math.PI / 6), 6);
    expect(f32[rotBase + 2]).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(f32[rotBase + 3]).toBeCloseTo(Math.sin(Math.PI / 4), 6);
  });

  it('star and dust range lanes mirror the carve fns', () => {
    const params: GalaxyParams = { type: 'SBb', starCount: 150000, spriteDust: 0.5 };
    const category = classifyHubbleType(params.type);
    const budget = splitStarBudget(category, params);
    const starLayout = carveStarLayout(category, params, budget);
    const dustLayout = carveDustLayout(category, params, budget);
    const u32 = new Uint32Array(pack(params));

    const starBase = GENERATION_UBO.arrays.starRanges.offsetVec4 * 4;
    for (let i = 0; i < GENERATION_UBO.arrays.starRanges.countVec4; i++) {
      const lane = starBase + i * 4;
      const range = starLayout.ranges[i];
      expect(Array.from(u32.slice(lane, lane + 4))).toEqual(
        range ? [range.start, range.iterations, range.stride, range.popId] : [0, 0, 0, 0],
      );
    }

    const dustBase = GENERATION_UBO.arrays.dustRanges.offsetVec4 * 4;
    for (let i = 0; i < GENERATION_UBO.arrays.dustRanges.countVec4; i++) {
      const lane = dustBase + i * 4;
      const range = dustLayout.ranges[i];
      expect(Array.from(u32.slice(lane, lane + 4))).toEqual(
        range ? [range.start, range.iterations, range.stride, range.popId] : [0, 0, 0, 0],
      );
    }
  });

  it('hii palette lanes equal hiiPalette(metallicity)', () => {
    const params: GalaxyParams = { type: 'Sb', starCount: 100000, metallicity: 0.8 };
    const f32 = new Float32Array(pack(params));
    const expected = hiiPalette(0.8);

    const coreBase = GENERATION_UBO.arrays.hiiCore.offsetVec4 * 4;
    expect(f32[coreBase]).toBeCloseTo(expected.core[0], 6);
    expect(f32[coreBase + 1]).toBeCloseTo(expected.core[1], 6);
    expect(f32[coreBase + 2]).toBeCloseTo(expected.core[2], 6);
    expect(f32[coreBase + 3]).toBe(0);

    const haloBase = GENERATION_UBO.arrays.hiiHalo.offsetVec4 * 4;
    expect(f32[haloBase]).toBeCloseTo(expected.halo[0], 6);
    expect(f32[haloBase + 1]).toBeCloseTo(expected.halo[1], 6);
    expect(f32[haloBase + 2]).toBeCloseTo(expected.halo[2], 6);
    expect(f32[haloBase + 3]).toBe(0);
  });

  it('category and numArms u32s are correct for SBb (3, clamped arm count)', () => {
    const params: GalaxyParams = { type: 'SBb', starCount: 100000, armCount: 12 };
    const u32 = new Uint32Array(pack(params));

    expect(u32[GENERATION_UBO.u32.category]).toBe(3);
    expect(u32[GENERATION_UBO.u32.numArms]).toBe(8); // round(12) clamped to MAX_ARMS
  });
});
