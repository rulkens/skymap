/** Radians shown as degrees (`63°`, `−20°`): angles are stored in radians, read in degrees. */
import { formatQuantity } from '../../utils/format/formatQuantity';

export function formatDegrees(rad: number): string {
  return formatQuantity((rad * 180) / Math.PI, '°');
}
