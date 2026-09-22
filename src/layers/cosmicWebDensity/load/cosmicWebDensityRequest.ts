/**
 * The request a density row loads with. An untiered row carries no `tier`, so a
 * tier flip leaves its request unchanged and the demand loop never reloads it.
 */

import type { Tier } from '../../../@types/data/Tier';
import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';

export function cosmicWebDensityRequest(
  entry: CosmicWebDensitySourceEntry,
  tier: Tier,
): CosmicWebDensityReq {
  return entry.tiered
    ? { binBaseName: entry.binBaseName, tier }
    : { binBaseName: entry.binBaseName };
}
