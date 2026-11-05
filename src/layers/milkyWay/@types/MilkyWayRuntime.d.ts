/**
 * The milkyWay Layer's whole runtime: the generated point cloud, its
 * two-pass renderer, the pick impostor, the aggregate offscreen's
 * upsample and the disk's pick code. Non-null throughout — `create` builds them all before
 * returning, which is what lets the passes read them without a null check.
 */

import type { MilkyWayCloud } from '../cloud/@types/MilkyWayCloud';
import type { MilkyWayCloudRenderer } from '../cloud/@types/MilkyWayCloudRenderer';
import type { MilkyWayPickRenderer } from '../picking/@types/MilkyWayPickRenderer';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';

export type MilkyWayRuntime = {
  readonly cloud: MilkyWayCloud;
  readonly cloudRenderer: MilkyWayCloudRenderer;
  readonly pickRenderer: MilkyWayPickRenderer;
  readonly aggregateUpsample: AdditiveUpsample;
  /** The disk's pick code; the pick impostor, label, emphasis and selection row all read it. */
  readonly pickCode: number;
};
