/** A vector as `12, −3, 0`, with an optional trailing unit (`12, −3, 0 Mpc`). */
import { formatNumber } from '../../utils/format/formatNumber';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function formatVec3(v: Vec3, unit?: string): string {
  const parts = v.map(formatNumber).join(', ');
  return unit === undefined ? parts : `${parts} ${unit}`;
}
