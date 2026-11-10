/** A world position stored in Mpc, all three axes in the ladder unit of its length: Mars reads `1.2, −0.6, −0.3 AU`, never `0, 0, 0 Mpc`. */
import { distanceRung } from '../../../../../src/utils/format/distanceRung';
import { formatNumber } from './formatNumber';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function formatPosition(v: Vec3): string {
  const length = Math.hypot(...v);
  if (length === 0) return '0, 0, 0 Mpc';
  const { value, unit } = distanceRung(length);
  return `${v.map((c) => formatNumber((c * value) / length)).join(', ')} ${unit}`;
}
