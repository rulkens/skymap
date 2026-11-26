/**
 * The density family's whole runtime: one renderer holding every cube, its
 * additive upsample, the march's jitter mask and its slot, and one slot per
 * source row committing into the renderer.
 * Non-null throughout — `create` builds all of it before returning.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import type { CosmicWebDensityFieldId } from './CosmicWebDensityFieldId';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../densityCubes/@types/CosmicWebDensityReq';

export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  /** Bound by the renderer from creation, zero until `jitterMaskSlot` commits; the Layer frees it. */
  readonly jitterMask: GPUTexture;
  /** The liveness waits for it to settle, so no cube marches the zero mask's step grid. */
  readonly jitterMaskSlot: AssetSlot<ArrayBuffer, void>;
  readonly slots: Readonly<
    Record<CosmicWebDensityFieldId, AssetSlot<GpuVolume, CosmicWebDensityReq>>
  >;
};
