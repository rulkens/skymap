/**
 * cf4DensitySlot — factory for the CF-4 DM density volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to `uploadVolumeField` under the
 * id `'cf4-density'` — the shared ingest path every volume slot commits
 * through (settings-row seed, renderer upload, fade bridge).
 *
 * **Lazy fetch.**  CF-4 is registry-visible:false, so its construction
 * seed lands `enabled: false` and the slot stays idle at boot.
 * Toggling the field on dispatches `writeVolumeField`, which flips the
 * `enabled` bit and triggers a demand-reevaluation load — keeping
 * default-off CF-4 off the boot bandwidth budget.
 */

import { createAssetSlot } from '../AssetSlot';
import { cf4DensityFetcher } from '../fetchers/cf4DensityFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { uploadVolumeField } from '../../engine/volume/uploadVolumeField';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createCf4DensitySlot: SlotFactory<ScalarCube, void> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const id = SOURCE_REGISTRY[Source.Cf4Density].id;
      uploadVolumeField(state, cb.store, id, cube);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
