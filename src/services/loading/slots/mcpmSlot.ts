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
 * default-on survey reads its seeded `surveys.items[id].enabled`, with
 * no field-state dependency on the cube having loaded first.
 */
import { createAssetSlot } from '../AssetSlot';
import { mcpmFetcher } from '../fetchers/mcpmFetcher';
import type { MCPMReq } from '../../../@types/loading/MCPMReq';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
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
      // Fade up only if the user has the field toggled on (matches the
      // symmetric path in engine.ts addVolumeField).
      if (state.settings.volumes.items[id]?.enabled) {
        void state.subsystems.fades.fadeTo(
          { kind: 'scalarField', field: id },
          1,
          FADE_IN_DURATION_MS,
        );
      }
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
