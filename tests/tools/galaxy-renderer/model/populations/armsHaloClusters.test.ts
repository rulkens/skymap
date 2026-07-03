/**
 * spiralArms / irregularClumps / halo / globularClusters — the remaining
 * four population builders, ported verbatim from galaxy-model.js:282-471.
 * Pins the record-count contracts that distinguish a *resample* (bulge/halo
 * rejection, globular clusters — always exactly the budget) from a *skip*
 * (spiral-arm clump gaps — undershoots the budget) from a *bonus write*
 * (HII knots on both spiral arms and irregular clumps — overshoots it), plus
 * the `DustSeed.armFade` contract each dust-emitting builder carries (a real
 * brightness envelope for spiral arms, a fixed 1 for irregular clumps).
 */
import { describe, expect, it } from 'vitest';
import { buildSpiralArms } from '../../../../../tools/galaxy-renderer/src/model/populations/spiralArms';
import { buildIrregularClumps } from '../../../../../tools/galaxy-renderer/src/model/populations/irregularClumps';
import { buildHalo } from '../../../../../tools/galaxy-renderer/src/model/populations/halo';
import { buildGlobularClusters } from '../../../../../tools/galaxy-renderer/src/model/populations/globularClusters';
import { computeBarGeometry } from '../../../../../tools/galaxy-renderer/src/model/computeBarGeometry';
import { createGalaxyBuildContext } from '../../../../../tools/galaxy-renderer/src/model/createGalaxyBuildContext';

describe('buildSpiralArms', () => {
  it('returns dust seeds with armFade in [0,1]', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    const seeds = buildSpiralArms(ctx, bar);

    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.armFade).toBeGreaterThanOrEqual(0);
      expect(seed.armFade).toBeLessThanOrEqual(1);
    }
  });

  it('with clumping and HII off, arm records equal the arm budget exactly', () => {
    const ctx = createGalaxyBuildContext({
      type: 'Sb',
      starCount: 30000,
      armClump: 0,
      hii: 0,
    });
    const bar = computeBarGeometry(ctx);
    buildSpiralArms(ctx, bar);

    expect(ctx.stars.count()).toBe(ctx.budget.armStarCount);
  });

  it('HII knots write bonus records', () => {
    const off = createGalaxyBuildContext({ type: 'Sb', starCount: 30000, armClump: 0, hii: 0 });
    const offBar = computeBarGeometry(off);
    buildSpiralArms(off, offBar);

    const on = createGalaxyBuildContext({ type: 'Sb', starCount: 30000, armClump: 0, hii: 2 });
    const onBar = computeBarGeometry(on);
    buildSpiralArms(on, onBar);

    expect(on.stars.count()).toBeGreaterThan(off.stars.count());
  });

  it('clump gaps skip records', () => {
    const ctx = createGalaxyBuildContext({
      type: 'Sb',
      starCount: 30000,
      armClump: 1,
      hii: 0,
    });
    const bar = computeBarGeometry(ctx);
    buildSpiralArms(ctx, bar);

    expect(ctx.stars.count()).toBeLessThan(ctx.budget.armStarCount);
  });

  it('no arm stars for lenticular — the builder tolerates a zero budget', () => {
    const ctx = createGalaxyBuildContext({ type: 'S0', starCount: 30000 });
    expect(ctx.budget.armStarCount).toBe(0);
    const bar = computeBarGeometry(ctx);
    const seeds = buildSpiralArms(ctx, bar);

    expect(seeds).toEqual([]);
    expect(ctx.stars.count()).toBe(0);
  });
});

describe('buildIrregularClumps', () => {
  it('writes exactly armStarCount records plus HII bonuses', () => {
    const ctx = createGalaxyBuildContext({ type: 'Irr', starCount: 30000 });
    buildIrregularClumps(ctx);

    expect(ctx.stars.count()).toBeGreaterThanOrEqual(ctx.budget.armStarCount);
  });

  it('dust seeds carry armFade 1', () => {
    const ctx = createGalaxyBuildContext({ type: 'Irr', starCount: 30000 });
    const seeds = buildIrregularClumps(ctx);

    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.armFade).toBe(1);
    }
  });
});

describe('buildHalo', () => {
  it('writes exactly haloCount records', () => {
    const ctx = createGalaxyBuildContext({ type: 'E1', starCount: 30000 });
    buildHalo(ctx);

    expect(ctx.stars.count()).toBe(ctx.budget.haloCount);
  });
});

describe('buildGlobularClusters', () => {
  it('writes clusters * 90 records', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000, globularCount: 12 });
    expect(ctx.budget.haloCount).toBe(0); // zero-halo spiral ctx

    const before = ctx.stars.count();
    buildGlobularClusters(ctx);
    const after = ctx.stars.count();

    expect(after - before).toBe(12 * 90);
  });
});
