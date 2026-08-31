/**
 * polyphorm2MrsSlot — factory for the Polyphorm 2MRS volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request), mirroring mcpmSlot. Hands
 * the decoded `ScalarCube` to `uploadVolumeField` under the registry id
 * `'polyphorm-2mrs'` on commit — the shared ingest path every volume slot
 * commits through. Lazy fetch: registry-visible:false seeds `enabled: false`;
 * toggling dispatches `writeVolumeField` to load on demand.
 */

import { createAssetSlot } from '../AssetSlot';
import { polyphorm2MrsFetcher } from '../fetchers/polyphorm2MrsFetcher';
import type { Polyphorm2MRSReq } from '../../../@types/loading/Polyphorm2MRSReq';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { uploadVolumeField } from '../../engine/volume/uploadVolumeField';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createPolyphorm2MrsSlot: SlotFactory<ScalarCube, Polyphorm2MRSReq> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'polyphorm2Mrs',
    fetch: polyphorm2MrsFetcher,
    commit: async (cube) => {
      const id = SOURCE_REGISTRY[Source.Polyphorm2MRS].id;
      uploadVolumeField(state, cb.store, id, cube);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] polyphorm2Mrs: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
