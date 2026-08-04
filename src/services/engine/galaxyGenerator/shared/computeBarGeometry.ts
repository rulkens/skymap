/**
 * computeBarGeometry — a barred galaxy's bar shape (length + tilt angle),
 * once per generation. Ported from the spike's `galaxy-model.js`.
 *
 * Takes `rand` (a bare draw function) plus the four scalars it needs, rather
 * than a whole build-context object — its one caller, `describeGalaxy`, has no
 * such context to offer. Threading a context type through here purely to
 * satisfy a signature would tangle this pure geometry calculation with a
 * construction contract it doesn't need.
 *
 * Draws the bar-tilt angle from `rand()` *unconditionally* — for every
 * category, not just `'barred'` — because that's where the spike's main
 * stream draws it (between the bulge loop and the
 * `category === 'barred'` branch that actually uses `barLength`).
 * `describeGalaxy`'s `mainStream` draws it in the equivalent position for the
 * same reason (see that module's header) so a barred galaxy's later
 * main-stream draws — the irregular clump / lenticular cloud centres — land
 * in the position the spike's RNG sequence would put them.
 *
 * A preset that pins `barAngleDeg` still CONSUMES that draw and throws it
 * away, for the same reason: skipping it would shift every later main-stream
 * draw and silently regenerate every other preset's particular stars.
 */
import { barLengthOf } from './barLengthOf';
import type { BarGeometry } from '../../../../@types/galaxy/BarGeometry';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';

export function computeBarGeometry(
  rand: () => number,
  category: GalaxyCategory,
  outerRadius: number,
  asymmetry: number,
  barStrength: number | undefined,
  barAngleDeg?: number,
): BarGeometry {
  const barLength = barLengthOf(category, outerRadius, barStrength);
  const drawnAngle = (rand() - 0.5) * 0.6 * asymmetry; // small random tilt
  const barTiltRad = barAngleDeg == null ? drawnAngle : (barAngleDeg * Math.PI) / 180;
  return { barLength, barTiltRad };
}
