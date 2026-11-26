/** A vector as `12, −3, 0`, unitless: a direction or other plain triple (positions read through formatPosition). */
import { formatNumber } from '../../utils/format/formatNumber';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function formatVec3(v: Vec3): string {
  return v.map(formatNumber).join(', ');
}
