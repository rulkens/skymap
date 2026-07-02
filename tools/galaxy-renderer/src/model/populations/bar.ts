/**
 * buildBar — for barred spirals, an elongated stellar bar the arms spring
 * from. Ported from galaxy-model.js:231-248; no-op outside `'barred'`.
 *
 * Position along the bar is a clamped gaussian (rejected past |t| > 1.25 —
 * `i--; continue`, a *resample* like the bulge's rejection, so
 * `floor(diskCount * 0.35)` records are always written exactly for barred
 * galaxies) so density fades at the ends with no hard edge, and the bar
 * narrows toward its tips. `bar` must be `computeBarGeometry`'s output for
 * *this* `ctx` — the orchestrator (Task 10) runs bulge -> computeBarGeometry
 * -> bar in that order to keep the shared `rand`/`randNormal` streams in the
 * spike's sequence.
 */
import { tempColor } from '../tempColor';
import type { BarGeometry } from '../../../@types/model/BarGeometry';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function buildBar(ctx: GalaxyBuildContext, bar: BarGeometry): void {
  const { category, budget, rand, randNormal, diskHeight, starSize, randomLuminosity, addStar } =
    ctx;
  if (category !== 'barred') return;

  const { barLength, cosBar, sinBar } = bar;
  const rgb: Vec3 = [0, 0, 0];
  const barStars = Math.floor(budget.diskCount * 0.35);

  for (let i = 0; i < barStars; i++) {
    const alongBar = randNormal() * 0.44;
    if (Math.abs(alongBar) > 1.25) {
      i--;
      continue;
    }
    const localX = alongBar * barLength;
    const barHalfWidth = barLength * (0.14 + 0.09 * rand()) * (1 - 0.4 * Math.abs(alongBar));
    const localZ = randNormal() * barHalfWidth;
    const x = localX * cosBar - localZ * sinBar;
    const z = localX * sinBar + localZ * cosBar;
    const y = randNormal() * diskHeight * 1.4;
    tempColor(0.29 + 0.17 * rand(), rgb);
    const endFade = Math.exp(-alongBar * alongBar * 1.3);
    addStar(
      x,
      y,
      z,
      rgb[0],
      rgb[1],
      rgb[2],
      starSize * (0.8 + 0.5 * rand()),
      randomLuminosity() * 0.9 * endFade,
    );
  }
}
