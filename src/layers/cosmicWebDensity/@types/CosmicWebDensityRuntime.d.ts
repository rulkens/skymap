/**
 * The density family's whole runtime: one renderer holding every cube, its
 * additive upsample, and one slot per source row committing into the renderer.
 * Non-null throughout — `create` builds all of it before returning.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from './CosmicWebDensityReq';

export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  readonly slots: Readonly<
    Record<CosmicWebDensityFieldId, AssetSlot<ScalarCube, CosmicWebDensityReq>>
  >;
};
