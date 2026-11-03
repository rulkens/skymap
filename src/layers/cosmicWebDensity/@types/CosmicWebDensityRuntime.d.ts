/**
 * The density family's whole runtime: one renderer holding every cube, its
 * additive upsample, and one slot per source row committing into the renderer.
 * Non-null throughout — `create` builds all of it before returning.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityFieldId } from './CosmicWebDensityFieldId';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { VolumeFieldRenderer } from '../densityCubes/@types/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../densityCubes/@types/CosmicWebDensityReq';

export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  readonly slots: Readonly<
    Record<CosmicWebDensityFieldId, AssetSlot<ScalarCube, CosmicWebDensityReq>>
  >;
};
