/**
 * encounterBlendWeightRate — d(weight)/dt in 1/day, the derivative of `encounterBlendWeight`;
 * the blended velocity needs it so the blended position and velocity stay a consistent pair.
 */
import { BLEND_END_DAYS, BLEND_FULL_DAYS } from './encounterBlendWeight';

export function encounterBlendWeightRate(dtDays: number): number {
  const a = Math.abs(dtDays);
  if (a <= BLEND_FULL_DAYS || a >= BLEND_END_DAYS) return 0;
  const width = BLEND_END_DAYS - BLEND_FULL_DAYS;
  return (
    -0.5 *
    Math.sign(dtDays) *
    (Math.PI / width) *
    Math.sin((Math.PI * (a - BLEND_FULL_DAYS)) / width)
  );
}
