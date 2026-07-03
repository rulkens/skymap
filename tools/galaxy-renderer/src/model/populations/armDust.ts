/**
 * buildArmDust — patchy dust lanes nudged onto the inner (concave) edge of
 * the spiral arms, with a dense-knot/thin-wisp split. Ported from
 * galaxy-model.js:522-538; runs for `'spiral' | 'barred'` categories, driven
 * entirely by the `DustSeed[]` `buildSpiralArms` already produced (this
 * builder does not re-check `category` — an empty `seeds` array from a
 * lenticular/elliptical/irregular ctx is already a no-op).
 *
 * `armDustBudget` is a hard cap, not a target: the loop stops the moment
 * `ctx.dust.count()` reaches it, exactly like the spike's `dustCount <
 * armDustBudget` condition — so a seed list far larger than the budget
 * still only ever writes up to `armDustBudget` particles.
 */
import type { DustField } from '../../../@types/model/DustField';
import type { DustSeed } from '../../../@types/model/DustSeed';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';

export function buildArmDust(
  ctx: GalaxyBuildContext,
  field: DustField,
  seeds: readonly DustSeed[],
): void {
  const { params, rand, randNormal, outerRadius, diskHeight, grainScale, addDust, dust } = ctx;
  const { dustMod, radialFalloff } = field;
  const dustAmount = params.dust ?? 1;
  const armDustBudget = Math.floor((30000 * dustAmount) / (grainScale * grainScale));

  for (let i = 0; i < seeds.length && dust.count() < armDustBudget; i++) {
    const seed = seeds[i]!;
    const inX = -Math.cos(seed.angle) * outerRadius * 0.018;
    const inZ = -Math.sin(seed.angle) * outerRadius * 0.018;
    const dense = rand() < 0.28; // a few dense knots, many thin wisps
    const x = seed.x + inX + randNormal() * outerRadius * 0.022;
    const y = seed.y * 0.4 + randNormal() * diskHeight * 0.28;
    const z = seed.z + inZ + randNormal() * outerRadius * 0.022;
    const m = dustMod(x, y, z);
    if (!m.keep) continue;
    const opacity =
      (dense ? 0.22 + 0.3 * rand() : 0.05 + 0.11 * rand()) *
      dustAmount *
      seed.armFade *
      (0.4 + 1.4 * radialFalloff(seed.radius)) *
      m.op;
    addDust(
      x,
      y,
      z,
      outerRadius * (0.007 + 0.015 * rand()) * grainScale * (dense ? 1.25 : 0.8) * m.sz,
      opacity,
    );
  }
}
