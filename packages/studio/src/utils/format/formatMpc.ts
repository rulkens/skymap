/** A distance stored in Mpc, on the app's distance ladder: `300 Mpc`, `785 kpc`, `30.0 kpc`, never `0 Mpc`. */
import { distanceRung } from '../../../../../src/utils/format/distanceRung';
import { formatScalar } from '../../../../../src/utils/format/formatScalar';

export function formatMpc(mpc: number): string {
  const { value, unit } = distanceRung(mpc);
  return `${formatScalar(value)} ${unit}`;
}
