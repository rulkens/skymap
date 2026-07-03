/**
 * buildBarDust — two straight dust lanes running along the bar's leading
 * edges, symmetric about its centre with a gaussian end-fade. Ported from
 * galaxy-model.js:540-551. No-op unless `bar.barLength > 0` — an unbarred
 * category's zero-length `BarGeometry` (see `computeBarGeometry`) already
 * carries that signal, so this builder checks the geometry rather than
 * `ctx.category` directly.
 */
import type { BarGeometry } from '../../../@types/model/BarGeometry';
import type { DustField } from '../../../@types/model/DustField';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';

export function buildBarDust(ctx: GalaxyBuildContext, field: DustField, bar: BarGeometry): void {
  const { barLength, cosBar, sinBar } = bar;
  if (!(barLength > 0)) return;

  const { params, rand, randNormal, outerRadius, diskHeight, grainScale, addDust } = ctx;
  const { dustMod } = field;
  const dustAmount = params.dust ?? 1;
  const barDustCount = Math.floor((9000 * dustAmount) / (grainScale * grainScale));

  for (let i = 0; i < barDustCount; i++) {
    const along = rand() * 2 - 1;
    const laneSide = (rand() < 0.5 ? 1 : -1) * barLength * (0.05 + 0.05 * rand());
    const localX = along * barLength * 0.92;
    const localZ = laneSide + randNormal() * barLength * 0.04;
    const x = localX * cosBar - localZ * sinBar;
    const z = localX * sinBar + localZ * cosBar;
    const y = randNormal() * diskHeight * 0.4;
    const m = dustMod(x, y, z);
    if (!m.keep) continue;
    addDust(
      x,
      y,
      z,
      outerRadius * (0.008 + 0.013 * rand()) * grainScale * m.sz,
      (0.06 + 0.1 * rand()) * dustAmount * Math.exp(-along * along * 1.2) * m.op,
    );
  }
}
