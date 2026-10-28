/** filamentSlot — factory for the cosmic-web skeleton's asset slot (its format is segments, not points). */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { filamentFetcher } from './filamentFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import type { FilamentRenderer } from '../../../@types/rendering/FilamentRenderer';

export function createFilamentSlot(
  renderer: FilamentRenderer,
): AssetSlot<FilamentCloud, FilamentReq> {
  return createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      renderer.upload(cloud);
    },
  });
}
