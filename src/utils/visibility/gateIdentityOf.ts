import type { FadeIdentity } from '../../@types/animation/FadeIdentity';
import type { AssetWiringRow } from '../../@types/loading/AssetWiringRow';

/** The fade identity an asset row's `gates` names. */
export function gateIdentityOf(gates: NonNullable<AssetWiringRow['gates']>): FadeIdentity {
  return typeof gates === 'string' ? { address: gates } : gates;
}
