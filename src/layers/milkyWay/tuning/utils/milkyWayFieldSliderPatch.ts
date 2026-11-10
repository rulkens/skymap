import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import type { MilkyWayFieldSliderKey } from '../@types/MilkyWayFieldSliderKey';

/**
 * The patch for one field slider. A `divisors` patch replaces the whole record,
 * so the other divisors are spread from the live `field` group.
 */
export function milkyWayFieldSliderPatch(
  field: MilkyWayFieldTuning,
  key: MilkyWayFieldSliderKey,
  value: number,
): Partial<MilkyWayFieldTuning> {
  if (key === 'exposure') return { exposure: value };
  return { divisors: { ...field.divisors, [key]: value } };
}
