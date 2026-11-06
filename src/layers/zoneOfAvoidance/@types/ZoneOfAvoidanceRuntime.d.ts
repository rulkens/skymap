/**
 * The zone-of-avoidance Layer's whole runtime: the band renderer, its
 * additive upsample and its pick code. Non-null throughout — `create` builds them before
 * returning, which is what lets the passes read them without a null check.
 */

import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { ZoneOfAvoidanceRenderer } from '../shell/@types/ZoneOfAvoidanceRenderer';

export type ZoneOfAvoidanceRuntime = {
  readonly renderer: ZoneOfAvoidanceRenderer;
  readonly upsample: AdditiveUpsample;
  /** The band's pick code; the pick stamp and the selection row both pack it. */
  readonly pickCode: number;
};
