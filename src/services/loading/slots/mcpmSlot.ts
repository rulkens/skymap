/**
 * mcpmSlot — factory for the MCPM Cosmic Web volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request). On commit, hands
 * the decoded ScalarCube to volumeFieldRenderer.upload under the
 * id 'mcpm'. The renderer reads per-cube static config
 * (contrastCenter, envelope, palette) from the registry and user-tunable
 * knobs from `state.settings.volumes.items` per frame — the commit
 * replays no renderer setter.
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
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createMcpmSlot: SlotFactory<ScalarCube, MCPMReq> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'mcpm',
    fetch: mcpmFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.volumeFieldRenderer;
      if (!renderer) return;
      const id = SOURCE_REGISTRY[Source.Mcpm].id;
      // Upload the cube; the renderer reads this field's per-cube static
      // config (contrastCenter, envelope, palette) from the registry and
      // its user-tunable knobs from `state.settings.volumes.items` per
      // frame, so the commit replays no renderer setter.  MCPM is a
      // shippable volume, so its settings row already exists from the
      // construction seed.
      renderer.upload(id, cube);
      // Drive the first-load fade through the intent → fade bridge; the
      // volumeField row's intent gate (reads settings.volumes.items[id].enabled)
      // decides, so a load that completes while the field is toggled off snaps to
      // opacity 0 and never renders until the user enables it.
      syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
      // No echo: React reads the per-field rows via `selectVolumeFieldItems` +
      // a `useMemo` projection off the engine-owned settings store, so the
      // commit's settings-row seed needs no callback fan-out.
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
