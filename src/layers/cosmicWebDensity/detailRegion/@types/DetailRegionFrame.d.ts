import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';

/** The region planner's value for one frame. */
export type DetailRegionFrame = {
  /** Every field id; null for a field with no region. */
  readonly draws: Readonly<Record<CosmicWebDensityFieldId, DetailRegionDraw | null>>;
  readonly busy: boolean;
};
