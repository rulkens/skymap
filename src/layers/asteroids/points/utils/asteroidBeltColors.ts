import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import { rec709Luminance } from '../../../../utils/color/rec709Luminance';
import { scaleToLuminance } from '../../../../utils/color/scaleToLuminance';

/**
 * The main belt's tint per Kirkwood band (inner, middle, outer). By class all three are the belt's
 * class tint, so the shader has no mode to branch on; by semi-major axis the middle band is the
 * ends' mix at their mean luminance, so it reads neither brighter nor darker than its neighbours.
 */
export function asteroidBeltColors(
  tuning: Pick<AsteroidTuning, 'colorBy' | 'colors' | 'beltRamp'>,
): readonly [Vec3, Vec3, Vec3] {
  if (tuning.colorBy === 'class') {
    const tint = tuning.colors.mainBelt;
    return [tint, tint, tint];
  }
  const { inner, outer } = tuning.beltRamp;
  const mix: Vec3 = [
    (inner[0] + outer[0]) / 2,
    (inner[1] + outer[1]) / 2,
    (inner[2] + outer[2]) / 2,
  ];
  const middle = scaleToLuminance(mix, (rec709Luminance(inner) + rec709Luminance(outer)) / 2);
  return [inner, middle, outer];
}
