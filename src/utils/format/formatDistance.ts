/**
 * An Mpc distance on the distance ladder (`distanceRung`), paired in the parsec family with the
 * light-year value of the same decade (pc↔ly … Gpc↔Gly): `100 Mpc / 326 Mly`. Parsecs serve the
 * astronomer, light-years anchor everyone else. The slash is deliberate: ` · ` already separates
 * different facts (distance · velocity). Below a parsec a fraction of a light-year helps no one, so
 * AU, km and m stand alone. Shared by the scale bar and the InfoCard so the two never drift.
 */
import { PC_TO_LY } from '../math/constants';
import { distanceRung } from './distanceRung';
import { formatScalar } from './formatScalar';

export function formatDistance(mpc: number): string {
  const { value, unit, lyUnit } = distanceRung(mpc);
  const own = `${formatScalar(value)} ${unit}`;
  return lyUnit === undefined ? own : `${own} / ${formatScalar(value * PC_TO_LY)} ${lyUnit}`;
}
