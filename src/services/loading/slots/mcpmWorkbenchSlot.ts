/**
 * mcpmWorkbenchSlot — factory for the MCPM workbench promoted-export
 * volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to `uploadVolumeField` under
 * the id `'mcpm-workbench'` — the shared ingest path every volume slot
 * commits through. Untiered like cf4DensitySlot (void request): one
 * cube, no per-tier variants.
 *
 * **Lazy fetch.** Hidden pending a promotion decision (see
 * `mcpm-workbench.ts`'s registry entry), so its construction seed lands
 * `enabled: false` and the slot stays idle at boot. No UI toggle exists
 * to flip it yet — the demand path only fires once one is added.
 */

import { createAssetSlot } from '../AssetSlot';
import { mcpmWorkbenchFetcher } from '../fetchers/mcpmWorkbenchFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { uploadVolumeField } from '../../engine/volume/uploadVolumeField';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createMcpmWorkbenchSlot: SlotFactory<ScalarCube, void> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'mcpmWorkbench',
    fetch: mcpmWorkbenchFetcher,
    commit: async (cube) => {
      const id = SOURCE_REGISTRY[Source.McpmWorkbench].id;
      uploadVolumeField(state, cb.store, id, cube);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] mcpmWorkbench: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
