import type { Vec3 } from '../../@types/math/Vec3';
import { temperatureToLinearRgb } from './temperatureToLinearRgb';

// `temperatureToLinearRgb` pins the brightest channel to 1.0, a pure hue; the
// additive HDR trail draw needs the palette's ≲ 0.5 ceiling or it blows out.
const TRAIL_LEVEL = 0.5;

/** An orbit trail in its star's own blackbody hue, dimmed for the additive trail draw. */
export function starTrailTint(temperatureK: number): Vec3 {
  const [r, g, b] = temperatureToLinearRgb(temperatureK);
  return [r * TRAIL_LEVEL, g * TRAIL_LEVEL, b * TRAIL_LEVEL];
}
