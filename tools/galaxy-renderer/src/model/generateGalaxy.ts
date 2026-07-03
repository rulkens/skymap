/**
 * generateGalaxy — the model's public face: one pure function from
 * `GalaxyParams` to `GeneratedGalaxy`. Composes every builder from Tasks 1-10
 * in the spike's fixed source order (galaxy-model.js:74-603). That order IS
 * the determinism contract — every builder that draws from `ctx.rand`/
 * `ctx.randNormal`/`ctx.asymRand` depends on nothing upstream of it in this
 * list drawing from the same stream out of order, or its ported formulas
 * desync from what they were validated against:
 *
 *  1. `createGalaxyBuildContext(params)` — seeds the streams, derives scale
 *     constants, draws the four `asymRand` asymmetry values.
 *  2. `buildBulge(ctx)` — first draw from the main `rand`/`randNormal`
 *     stream (model.js:199).
 *  3. `computeBarGeometry(ctx.rand, ctx.category, ctx.outerRadius, ctx.asymmetry,
 *     ctx.params.barStrength)` — UNCONDITIONAL for every category: the spike
 *     draws the bar-tilt angle here regardless of whether a bar gets built
 *     (model.js:229), so skipping this for non-barred galaxies would desync
 *     every population drawn after it. Takes bare scalars rather than the
 *     whole `ctx` because `packGenerationUniforms` (Task 2) is a second
 *     caller with no `GalaxyBuildContext` of its own.
 *  4. `buildBar(ctx, bar)` — no-ops outside `category === 'barred'`
 *     (internal guard, not re-checked here).
 *  5. `buildDisk(ctx, bar)` — no-ops when `budget.diskCount === 0`
 *     (falls out of the loop bound, no explicit guard needed).
 *  6. `buildSpiralArms(ctx, bar)` → arm dust seeds — no-ops unless
 *     `budget.armStarCount > 0 && category !== 'irregular'` (internal
 *     guard).
 *  7. `buildIrregularClumps(ctx)` → irregular dust seeds — no-ops outside
 *     `category === 'irregular'` (internal guard).
 *  8. `buildHalo(ctx)` — no-ops when `budget.haloCount === 0`.
 *  9. `buildGlobularClusters(ctx)` — no-ops when `params.globularCount` is
 *     falsy.
 * 10. Dust pass, gated on `(params.dust ?? 1) > 0 && category !== 'elliptical'`
 *     (model.js:501) — unlike steps 4-9, nothing downstream of this gate
 *     self-guards, so it's enforced here: `createDustField(ctx)`, then
 *     category dispatch — spiral/barred → `buildArmDust` then `buildBarDust`;
 *     lenticular → `buildLenticularDust`; irregular → `buildIrregularDust`.
 * 11. Return the filled views: `ctx.stars.view()`/`count()` (zero-copy
 *     subarray) and `ctx.dust.toFloat32Array()`/`count()` (tight copy — the
 *     dust count isn't known up front).
 */
import { computeBarGeometry } from './computeBarGeometry';
import { createDustField } from './createDustField';
import { createGalaxyBuildContext } from './createGalaxyBuildContext';
import { buildArmDust } from './populations/armDust';
import { buildBar } from './populations/bar';
import { buildBarDust } from './populations/barDust';
import { buildBulge } from './populations/bulge';
import { buildDisk } from './populations/disk';
import { buildGlobularClusters } from './populations/globularClusters';
import { buildHalo } from './populations/halo';
import { buildIrregularClumps } from './populations/irregularClumps';
import { buildIrregularDust } from './populations/irregularDust';
import { buildLenticularDust } from './populations/lenticularDust';
import { buildSpiralArms } from './populations/spiralArms';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { GeneratedGalaxy } from '../../@types/model/GeneratedGalaxy';

export function generateGalaxy(params: GalaxyParams): GeneratedGalaxy {
  const ctx = createGalaxyBuildContext(params);

  buildBulge(ctx);
  const bar = computeBarGeometry(
    ctx.rand,
    ctx.category,
    ctx.outerRadius,
    ctx.asymmetry,
    ctx.params.barStrength,
  );
  buildBar(ctx, bar);
  buildDisk(ctx, bar);
  const armDustSeeds = buildSpiralArms(ctx, bar);
  const irregularDustSeeds = buildIrregularClumps(ctx);
  buildHalo(ctx);
  buildGlobularClusters(ctx);

  const dustAmount = params.dust ?? 1;
  if (dustAmount > 0 && ctx.category !== 'elliptical') {
    const field = createDustField(ctx);
    if (ctx.category === 'spiral' || ctx.category === 'barred') {
      buildArmDust(ctx, field, armDustSeeds);
      buildBarDust(ctx, field, bar);
    } else if (ctx.category === 'lenticular') {
      buildLenticularDust(ctx, field);
    } else if (ctx.category === 'irregular') {
      buildIrregularDust(ctx, field, irregularDustSeeds);
    }
  }

  return {
    stars: ctx.stars.view(),
    starCount: ctx.stars.count(),
    dust: ctx.dust.toFloat32Array(),
    dustCount: ctx.dust.count(),
  };
}
