/**
 * createCosmicWebDensitySlot — one density row's asset slot, construction-pure.
 *
 * The upload must land synchronously inside `commit`, before the slot reports
 * `ready`: `installFadeOnArrival` re-runs the field fade row's guard
 * (`renderer.listIds()`) on that edge, and an upload after it misses the
 * false→true flip, so the cube never fades in.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { cosmicWebDensityFetcher } from './cosmicWebDensityFetcher';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';

export function createCosmicWebDensitySlot(
  entry: (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number][1],
  renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>,
): AssetSlot<ScalarCube, CosmicWebDensityReq> {
  const id = entry.id;
  return createAssetSlot<ScalarCube, CosmicWebDensityReq>({
    name: id,
    fetch: cosmicWebDensityFetcher,
    commit: async (cube) => {
      renderer.upload(id, cube, entry);
    },
  });
}
