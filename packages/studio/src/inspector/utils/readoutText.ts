/** Text for a computed, non-editable field: numbers and names as typed, vectors as `x, y, z`, a bound subject as `◎id`. */
import { formatVec3 } from '../../kinds/utils/formatVec3';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatNumber } from '../../utils/format/formatNumber';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function readoutText(param: string, value: unknown): string {
  if (param === 'id' && typeof value === 'string') return `◎${value}`;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumber(value);
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'number')
      ? formatVec3(value as Vec3)
      : formatNameList(value.map(String));
  }
  return value === undefined ? '–' : 'custom';
}
