import { sameRequest } from '../../../utils/loading/sameRequest';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { Tier } from '../../../@types/data/Tier';

/**
 * The row's request no longer names what its slot is holding. Null `lastRequest()` is
 * never drift: an idle or just-released slot has nothing to have drifted from.
 */
export function requestDrifted(
  slot: AssetSlot<unknown, unknown>,
  row: AssetWiringRow,
  tier: Tier,
): boolean {
  const last = slot.lastRequest();
  // Before `req(tier)`, which allocates on every row of every frame.
  if (last === null) return false;
  return !sameRequest(last, row.req(tier));
}
