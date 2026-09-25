/**
 * The milkyWay Layer's whole runtime: the generated point cloud, its
 * two-pass renderer, the pick impostor, and the aggregate offscreen's
 * upsample. Non-null throughout — `create` builds all four before
 * returning, which is what lets the passes read them without a null check.
 */

import type { MilkyWayCloud } from '../../../@types/galaxy/MilkyWayCloud';
import type { MilkyWayCloudRenderer } from './MilkyWayCloudRenderer';
import type { MilkyWayPickRenderer } from '../../../@types/rendering/MilkyWayPickRenderer';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';

export type MilkyWayRuntime = {
  readonly cloud: MilkyWayCloud;
  readonly cloudRenderer: MilkyWayCloudRenderer;
  readonly pickRenderer: MilkyWayPickRenderer;
  readonly aggregateUpsample: AdditiveUpsample;
};
