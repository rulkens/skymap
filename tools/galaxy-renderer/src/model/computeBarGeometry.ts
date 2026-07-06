/**
 * computeBarGeometry — precomputes a barred galaxy's bar shape (length +
 * fixed orientation trig) once per generation, per `BarGeometry`'s docblock.
 * Ported from galaxy-model.js:228-230.
 *
 * Takes `rand` (a bare draw function) plus the four scalars it needs, rather
 * than a whole build-context object — its one caller, `packGenerationUniforms`,
 * packs the GPU generation UBO and has no such context to offer. Threading a
 * context type through here purely to satisfy a signature would tangle this
 * pure geometry calculation with a construction contract it doesn't need.
 *
 * Draws the bar-tilt angle from `rand()` *unconditionally* — for every
 * category, not just `'barred'` — because that's where the spike's main
 * stream draws it (model.js:229, between the bulge loop and the
 * `category === 'barred'` branch that actually uses `barLength`).
 * `packGenerationUniforms`'s `mainStream` draws it in the equivalent position
 * for the same reason (see that module's header) so a barred galaxy's later
 * main-stream draws — the irregular clump / lenticular cloud centres — land
 * in the position the spike's RNG sequence would put them.
 */
import { barLengthOf } from './barLengthOf';
import type { BarGeometry } from '../../../../src/@types/galaxy/BarGeometry';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';

export function computeBarGeometry(
  rand: () => number,
  category: GalaxyCategory,
  outerRadius: number,
  asymmetry: number,
  barStrength: number | undefined,
): BarGeometry {
  const barLength = barLengthOf(category, outerRadius, barStrength);
  const barAngle = (rand() - 0.5) * 0.6 * asymmetry; // small random tilt
  return { barLength, cosBar: Math.cos(barAngle), sinBar: Math.sin(barAngle) };
}
