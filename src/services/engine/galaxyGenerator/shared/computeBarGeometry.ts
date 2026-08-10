/**
 * computeBarGeometry — a barred galaxy's bar shape (length + tilt angle).
 *
 * Draws the tilt angle from `rand()` unconditionally, for every category, not
 * just `'barred'`: `describeGalaxy`'s `mainStream` draws in the same relative
 * position for every galaxy, so skipping this draw for a non-barred (or
 * pinned-angle) galaxy would shift every later main-stream draw — the
 * irregular clump / lenticular cloud centres — and silently regenerate a
 * different galaxy. A pinned `barAngleDeg` still consumes the draw and
 * discards it, for the same reason.
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
  const drawnAngle = (rand() - 0.5) * 0.6 * asymmetry;
  const barTiltRad = barAngleDeg == null ? drawnAngle : (barAngleDeg * Math.PI) / 180;
  return { barLength, barTiltRad };
}
