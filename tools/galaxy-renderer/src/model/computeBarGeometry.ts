/**
 * computeBarGeometry — precomputes a barred galaxy's bar shape (length +
 * fixed orientation trig) once per generation, per `BarGeometry`'s docblock.
 * Ported from galaxy-model.js:228-230.
 *
 * Draws the bar-tilt angle from `ctx.rand()` *unconditionally* — for every
 * category, not just `'barred'` — because that's where the spike's main
 * stream draws it (model.js:229, between the bulge loop and the
 * `category === 'barred'` branch that actually uses `barLength`). This
 * builder must therefore run between `buildBulge` and `buildBar` in the
 * orchestrator (Task 10) even for non-barred galaxies, or every population
 * drawn after it desyncs from the spike's RNG sequence.
 */
import type { BarGeometry } from '../../@types/model/BarGeometry';
import type { GalaxyBuildContext } from '../../@types/model/GalaxyBuildContext';

export function computeBarGeometry(ctx: GalaxyBuildContext): BarGeometry {
  const { rand, category, outerRadius, asymmetry, params } = ctx;
  const barLength = category === 'barred' ? outerRadius * 0.42 * (params.barStrength ?? 1) : 0;
  const barAngle = (rand() - 0.5) * 0.6 * asymmetry; // small random tilt
  return { barLength, cosBar: Math.cos(barAngle), sinBar: Math.sin(barAngle) };
}
