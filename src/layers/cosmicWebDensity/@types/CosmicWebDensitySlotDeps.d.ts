/** What every density slot shares: the one renderer, the jitter mask's readiness and the fetcher. */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../densityCubes/@types/CosmicWebDensityReq';
import type { CosmicWebDensityFieldId } from './CosmicWebDensityFieldId';

export type CosmicWebDensitySlotDeps = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  /** Every commit awaits it (a cube drawn before the mask marches unjittered). */
  readonly jitterMaskReady: Promise<void>;
  readonly fetch: Fetcher<GpuVolume, CosmicWebDensityReq>;
};
