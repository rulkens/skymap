/**
 * mcpmSlot — factory for the MCPM Cosmic Web volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request). On commit, hands
 * the decoded ScalarCube to `uploadVolumeField` under the id 'mcpm' —
 * the shared ingest path every volume slot commits through.
 *
 * Default-on cosmic-web baseline (registry visible:true). Its on/off
 * bit is seeded at engine construction, so the demand predicate
 * `items['mcpm'].enabled` reads true at boot — symmetric with how a
 * default-on galaxy catalog reads its seeded `galaxyCatalogs.items[id].enabled`, with
 * no field-state dependency on the cube having loaded first.
 */
import { createAssetSlot } from '../AssetSlot';
import { mcpmFetcher } from '../fetchers/mcpmFetcher';
import type { MCPMReq } from '../../../@types/loading/MCPMReq';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { uploadVolumeField } from '../../engine/volume/uploadVolumeField';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createMcpmSlot: SlotFactory<ScalarCube, MCPMReq> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'mcpm',
    fetch: mcpmFetcher,
    commit: async (cube) => {
      const id = SOURCE_REGISTRY[Source.Mcpm].id;
      uploadVolumeField(state, cb.store, id, cube);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] mcpm: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
