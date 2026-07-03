/**
 * createGalaxyBuildContext — the spike's closure environment, made explicit.
 * Pins the RNG draw-order contract (construction draws nothing from the main
 * stream; asymRand draws exactly four values, in order, for the lopsided/
 * triaxial-bulge asymmetry) and the scale-constant formulas extracted from
 * galaxy-model.js:79-194.
 */
import { describe, expect, it } from 'vitest';
import { createGalaxyBuildContext } from '../../../../tools/galaxy-renderer/src/model/createGalaxyBuildContext';
import { makeWarpOffset } from '../../../../tools/galaxy-renderer/src/model/makeWarpOffset';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import type { GalaxyParams } from '../../../../tools/galaxy-renderer/@types/model/GalaxyParams';

describe('createGalaxyBuildContext', () => {
  it('scale constants match the spike formulas', () => {
    const params: GalaxyParams = {
      type: 'Sc',
      radius: 1.3,
      diskThickness: 0.8,
      bulgeSize: 0.5,
      starCount: 400000,
    };
    const ctx = createGalaxyBuildContext(params);

    expect(ctx.outerRadius).toBeCloseTo(13, 12);
    expect(ctx.diskScaleLen).toBeCloseTo(13 / 3.2, 12);
    expect(ctx.bulgeRadius).toBeCloseTo(13 * 0.34 * 0.5, 12);
    expect(ctx.diskHeight).toBeCloseTo(0.055 * 13 * 0.8, 12);
    expect(ctx.grainScale).toBeCloseTo(1, 12);
    expect(ctx.starSize).toBeCloseTo(0.016 * 13 * 1, 12);
  });

  it('grainScale is 1 at 400k stars and shrinks with more stars', () => {
    const at400k = createGalaxyBuildContext({ type: 'Sc', starCount: 400000 });
    const at800k = createGalaxyBuildContext({ type: 'Sc', starCount: 800000 });

    expect(at400k.grainScale).toBeCloseTo(1, 12);
    expect(at800k.grainScale).toBeCloseTo(Math.cbrt(0.5), 12);
    expect(at800k.grainScale).toBeLessThan(at400k.grainScale);
  });

  it('elliptical flattening follows the E-digit', () => {
    const e0 = createGalaxyBuildContext({ type: 'E0' });
    const e7 = createGalaxyBuildContext({ type: 'E7' });

    expect(e0.flattening).toBeCloseTo(1, 12);
    expect(e7.flattening).toBeCloseTo(1 - 0.63, 12);
  });

  it('addStar applies the warp offset to y', () => {
    const params: GalaxyParams = { type: 'Sc', starCount: 20000, warpStrength: 0.3 };
    const ctx = createGalaxyBuildContext(params);
    const expectedWarp = makeWarpOffset(params, ctx.outerRadius);

    // A point out in the disk/arm region, well past warpStart (0.3 * outerRadius).
    const x = 8;
    const y = 0.4;
    const z = 1;
    ctx.addStar(x, y, z, 1, 1, 1, 0.1, 0.5);

    // stars.view() is a Float32Array, so the stored value only has ~7
    // significant digits of precision — Math.fround the expectation to
    // match, rather than loosening the tolerance and masking a real bug.
    const record = ctx.stars.view();
    expect(record[1]).toBe(Math.fround(y + expectedWarp(x, z)));
    // Sanity: the warp at this point is non-zero, so this test actually
    // exercises the addition rather than degenerating to y === y.
    expect(expectedWarp(x, z)).not.toBe(0);
  });

  it('addDust reddens: r > g > b, and colours differ per record', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sc', starCount: 20000 });

    ctx.addDust(1, 0, 1, 0.1, 0.5);
    ctx.addDust(2, 0, 2, 0.1, 0.5);
    ctx.addDust(3, 0, 3, 0.1, 0.5);

    const out = ctx.dust.toFloat32Array();
    expect(ctx.dust.count()).toBe(3);
    const record0 = out.subarray(0, 8);
    const record1 = out.subarray(8, 16);
    const record2 = out.subarray(16, 24);
    for (const record of [record0, record1, record2]) {
      const [, , , , r, g, b] = Array.from(record);
      expect(r).toBeGreaterThan(g!);
      expect(g).toBeGreaterThan(b!);
    }
    // Per-particle draws: successive records must not be identical.
    expect(Array.from(record0)).not.toEqual(Array.from(record1));
    expect(Array.from(record1)).not.toEqual(Array.from(record2));
  });

  it('two contexts from equal params are stream-identical', () => {
    const params: GalaxyParams = { type: 'Sc', starCount: 20000, seed: 42 };
    const ctxA = createGalaxyBuildContext(params);
    const ctxB = createGalaxyBuildContext({ ...params });

    const drawsA = Array.from({ length: 100 }, () => ctxA.rand());
    const drawsB = Array.from({ length: 100 }, () => ctxB.rand());
    expect(drawsA).toEqual(drawsB);
  });

  it('asymRand construction consumes exactly four draws', () => {
    const params: GalaxyParams = { type: 'Sc', starCount: 20000, asymSeed: 123 };
    const ctx = createGalaxyBuildContext(params);

    const reference = mulberry32((params.asymSeed! | 0 || 331) >>> 0);
    reference(); // lopsidedAmp
    reference(); // lopsidedAngle
    reference(); // bulgeAxisZ
    reference(); // bulgeAngle

    expect(ctx.asymRand()).toBe(reference());
  });
});
