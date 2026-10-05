/**
 * The zone-of-avoidance Layer's whole runtime: the band renderer and its
 * additive upsample. Non-null throughout — `create` builds both before
 * returning, which is what lets the passes read them without a null check.
 */

import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { ZoneOfAvoidanceRenderer } from '../../../@types/rendering/ZoneOfAvoidanceRenderer';

export type ZoneOfAvoidanceRuntime = {
  readonly renderer: ZoneOfAvoidanceRenderer;
  readonly upsample: AdditiveUpsample;
};
