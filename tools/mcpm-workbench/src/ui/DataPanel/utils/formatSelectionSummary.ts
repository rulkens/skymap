import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import { formatSizeMpc } from '../../GridBoxPanel/utils/formatSizeMpc';

/** formatSelectionSummary — the box's extent in the size sliders' own numbers. */
export function formatSelectionSummary(sizeMpc: Readonly<Vec3>): string {
  return `${sizeMpc.map(formatSizeMpc).join(' × ')} Mpc`;
}
