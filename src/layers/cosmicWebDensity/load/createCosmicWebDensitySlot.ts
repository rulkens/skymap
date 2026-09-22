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
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import type { VolumeFieldRenderer } from '../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';

export function createCosmicWebDensitySlot(
  entry: CosmicWebDensitySourceEntry,
  renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>,
): AssetSlot<ScalarCube, CosmicWebDensityReq> {
  // `SourceEntryBase.id` is `string`; every density row's id is a
  // `CosmicWebDensityFieldId` by construction (the union is derived from them).
  const id = entry.id as CosmicWebDensityFieldId;
  const slot = createAssetSlot<ScalarCube, CosmicWebDensityReq>({
    name: id,
    fetch: cosmicWebDensityFetcher,
    commit: async (cube) => {
      renderer.upload(id, cube, entry);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] ${id}: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
}
