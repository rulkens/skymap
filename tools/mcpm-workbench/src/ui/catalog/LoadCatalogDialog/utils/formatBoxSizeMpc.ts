import type { Vec3 } from '../../../../../../../src/@types/math/Vec3';
import { formatSizeMpc } from '../../../../utils/format/formatSizeMpc';

/** formatBoxSizeMpc — a box's size as the size sliders show it, once when it is a cube. */
export function formatBoxSizeMpc(sizeMpc: Vec3): string {
  const [x, y, z] = sizeMpc.map(formatSizeMpc);
  return x === y && y === z ? `${x} Mpc` : `${x} × ${y} × ${z} Mpc`;
}
