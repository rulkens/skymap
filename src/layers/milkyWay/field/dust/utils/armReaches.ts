import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import { armFadeEnvelope } from '../../arms/utils/armFadeEnvelope';

/**
 * An event only carves where its arm actually reaches: past the fade
 * envelope there is no arm to sweep dust out of. Testing the fade envelope
 * directly rather than the lane ledger's full amplitude is equivalent —
 * every other factor in that product (age weight, lane width, carried
 * column) is strictly positive wherever tau is.
 */
export function armReaches(
  armRadius: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): boolean {
  return armFadeEnvelope(armRadius, geometry, arm) > 0;
}
