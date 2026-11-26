/**
 * The density family's whole runtime: one renderer holding every cube, its
 * additive upsample, the march's jitter mask, and one slot per source row
 * committing into the renderer.
 * Non-null throughout — `create` builds all of it before returning.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityFieldId } from './CosmicWebDensityFieldId';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { BlueNoiseMask } from '../../../@types/rendering/BlueNoiseMask';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../densityCubes/@types/CosmicWebDensityReq';

export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  /** Bound by the renderer, awaited by every slot's commit; the Layer owns and frees it. */
  readonly jitterMask: BlueNoiseMask;
  readonly slots: Readonly<
    Record<CosmicWebDensityFieldId, AssetSlot<ScalarCube, CosmicWebDensityReq>>
  >;
};
