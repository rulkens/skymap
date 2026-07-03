/**
 * bulge / computeBarGeometry / bar / disk — the first four population
 * builders, ported verbatim from galaxy-model.js:196-280. Pins the record
 * counts (rejection resamples keep the bulge count exact; the barred disk's
 * `continue`-skip does not), the bar-geometry draw-order contract
 * (`computeBarGeometry` takes exactly one unconditional main-stream draw,
 * model.js:229), and the shape of each population (elliptical bulges extend
 * further than a disk-galaxy bulge; disk stars stay near the plane).
 */
import { describe, expect, it } from 'vitest';
import { buildBulge } from '../../../../../tools/galaxy-renderer/src/model/populations/bulge';
import { computeBarGeometry } from '../../../../../tools/galaxy-renderer/src/model/computeBarGeometry';
import { buildBar } from '../../../../../tools/galaxy-renderer/src/model/populations/bar';
import { buildDisk } from '../../../../../tools/galaxy-renderer/src/model/populations/disk';
import { createGalaxyBuildContext } from '../../../../../tools/galaxy-renderer/src/model/createGalaxyBuildContext';
import type { GalaxyParams } from '../../../../../tools/galaxy-renderer/@types/model/GalaxyParams';

const STRIDE = 8;

/** Max hypot(x, y, z) across every written star record. */
function maxRadius(view: Float32Array): number {
  let max = 0;
  for (let i = 0; i < view.length; i += STRIDE) {
    const r = Math.hypot(view[i]!, view[i + 1]!, view[i + 2]!);
    if (r > max) max = r;
  }
  return max;
}

describe('buildBulge', () => {
  it('writes exactly budget.bulgeCount records for a spiral', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    buildBulge(ctx);
    expect(ctx.stars.count()).toBe(ctx.budget.bulgeCount);
  });

  it('writes exactly budget.bulgeCount records for an elliptical', () => {
    const ctx = createGalaxyBuildContext({ type: 'E1', starCount: 30000 });
    buildBulge(ctx);
    expect(ctx.stars.count()).toBe(ctx.budget.bulgeCount);
  });

  it('an elliptical bulge extends beyond a disk-galaxy bulge at the same outerRadius', () => {
    // Both at radius: 1 -> outerRadius 10. Elliptical's rejection cap is
    // outerRadius * 1.6 = 16; a disk-galaxy bulge's cap is
    // bulgeRadius * 2.8 = (10 * 0.34) * 2.8 = 9.52 — strictly tighter.
    const ellipticalCtx = createGalaxyBuildContext({ type: 'E1', starCount: 30000 });
    const spiralCtx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    buildBulge(ellipticalCtx);
    buildBulge(spiralCtx);

    const ellipticalMax = maxRadius(ellipticalCtx.stars.view());
    const spiralMax = maxRadius(spiralCtx.stars.view());
    expect(ellipticalMax).toBeGreaterThan(spiralMax);
  });
});

describe('computeBarGeometry', () => {
  it('is zero-length for a non-barred category', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    expect(bar.barLength).toBe(0);
  });

  it('is outerRadius * 0.42 * barStrength for a barred category', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', starCount: 30000, radius: 1.3 });
    const bar = computeBarGeometry(ctx);
    expect(bar.barLength).toBeCloseTo(ctx.outerRadius * 0.42 * 1, 12);
  });

  it('scales with an explicit barStrength', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', starCount: 30000, barStrength: 0.5 });
    const bar = computeBarGeometry(ctx);
    expect(bar.barLength).toBeCloseTo(ctx.outerRadius * 0.42 * 0.5, 12);
  });

  it('consumes exactly one main-stream draw for every category', () => {
    const params: GalaxyParams = { type: 'Sb', starCount: 30000, seed: 7 };
    const ctxA = createGalaxyBuildContext(params);
    const ctxB = createGalaxyBuildContext({ ...params });

    computeBarGeometry(ctxA);
    ctxB.rand(); // stand-in for the same single unconditional draw

    expect(ctxA.rand()).toBe(ctxB.rand());
  });

  it('draws exactly one main-stream draw for a barred category too', () => {
    const params: GalaxyParams = { type: 'SBb', starCount: 30000, seed: 7 };
    const ctxA = createGalaxyBuildContext(params);
    const ctxB = createGalaxyBuildContext({ ...params });

    computeBarGeometry(ctxA);
    ctxB.rand();

    expect(ctxA.rand()).toBe(ctxB.rand());
  });
});

describe('buildBar', () => {
  it('writes floor(diskCount * 0.35) records for a barred galaxy', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    buildBar(ctx, bar);
    expect(ctx.stars.count()).toBe(Math.floor(ctx.budget.diskCount * 0.35));
  });

  it('writes no records for a non-barred galaxy', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    buildBar(ctx, bar);
    expect(ctx.stars.count()).toBe(0);
  });
});

describe('buildDisk', () => {
  it('spiral disk writes exactly diskCount records', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    buildDisk(ctx, bar);
    expect(ctx.stars.count()).toBe(ctx.budget.diskCount);
  });

  it('barred disk writes fewer than diskCount records', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    buildDisk(ctx, bar);
    expect(ctx.stars.count()).toBeLessThan(ctx.budget.diskCount);
  });

  it('disk stars sit near the plane — |y| bounded by a few times diskHeight', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', starCount: 30000 });
    const bar = computeBarGeometry(ctx);
    buildDisk(ctx, bar);

    const view = ctx.stars.view();
    let maxAbsY = 0;
    for (let i = 0; i < view.length; i += STRIDE) {
      const absY = Math.abs(view[i + 1]!);
      if (absY > maxAbsY) maxAbsY = absY;
    }
    // Gaussian draws are unbounded in principle but astronomically unlikely
    // to exceed ~6 sigma of the widest puff factor (0.6 + 1 = 1.6 at r->0).
    expect(maxAbsY).toBeLessThan(ctx.diskHeight * 1.6 * 6);
  });
});

describe('bulge -> computeBarGeometry -> bar -> disk main-stream sequencing', () => {
  it('runs in spike order without desyncing the shared rand stream', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', starCount: 30000 });
    buildBulge(ctx);
    const bulgeCount = ctx.stars.count();
    const bar = computeBarGeometry(ctx);
    buildBar(ctx, bar);
    const barCount = ctx.stars.count() - bulgeCount;
    buildDisk(ctx, bar);
    const diskCount = ctx.stars.count() - bulgeCount - barCount;

    expect(bulgeCount).toBe(ctx.budget.bulgeCount);
    expect(barCount).toBe(Math.floor(ctx.budget.diskCount * 0.35));
    expect(diskCount).toBeLessThan(ctx.budget.diskCount);
    expect(ctx.stars.count()).toBe(bulgeCount + barCount + diskCount);
  });
});
