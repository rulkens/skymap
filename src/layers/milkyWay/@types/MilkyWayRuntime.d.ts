/**
 * The milkyWay Layer's whole runtime: the generated point cloud, its
 * two-pass renderer, the pick impostor, the additive upsample (the aggregate
 * offscreen's and the field targets'), the v2 field's host slot and the
 * disk's pick code. Non-null throughout —
 * `create` builds them all before returning, which is what lets the passes
 * read them without a null check; the slot itself holds its host lazily.
 */

import type { MilkyWayCloud } from '../cloud/@types/MilkyWayCloud';
import type { MilkyWayCloudRenderer } from '../cloud/@types/MilkyWayCloudRenderer';
import type { MilkyWayPickRenderer } from '../picking/@types/MilkyWayPickRenderer';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { FieldHostSlot } from '../field/host/@types/FieldHostSlot';

export type MilkyWayRuntime = {
  readonly cloud: MilkyWayCloud;
  readonly cloudRenderer: MilkyWayCloudRenderer;
  readonly pickRenderer: MilkyWayPickRenderer;
  readonly additiveUpsample: AdditiveUpsample;
  /** Only `milkyWayPlanner` syncs it; the field's passes read the planner's value instead. */
  readonly fieldHost: FieldHostSlot;
  /** The disk's pick code; the pick impostor, label, emphasis and selection row all read it. */
  readonly pickCode: number;
};
