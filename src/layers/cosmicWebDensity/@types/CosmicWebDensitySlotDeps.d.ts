/** What every density slot shares: the one renderer and the fetcher. */

import type { Fetcher } from '../../../../packages/shared/src/@types/loading/Fetcher';
import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../densityCubes/@types/CosmicWebDensityReq';
import type { CosmicWebDensityFieldId } from './CosmicWebDensityFieldId';

export type CosmicWebDensitySlotDeps = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly fetch: Fetcher<GpuVolume, CosmicWebDensityReq>;
};
