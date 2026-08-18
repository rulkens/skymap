/**
 * polyphorm2MrsSlot — factory for the Polyphorm 2MRS volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request), mirroring mcpmSlot. Hands
 * the decoded `ScalarCube` to `volumeFieldRenderer.upload` under the registry
 * id `'polyphorm-2mrs'` on commit. Lazy fetch: registry-visible:false seeds
 * `enabled: false`; toggling dispatches `writeVolumeField` to load on demand.
 */

import { createAssetSlot } from '../AssetSlot';
import { polyphorm2MrsFetcher } from '../fetchers/polyphorm2MrsFetcher';
import type { Polyphorm2MRSReq } from '../../../@types/loading/Polyphorm2MRSReq';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createPolyphorm2MrsSlot: SlotFactory<ScalarCube, Polyphorm2MRSReq> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'polyphorm2Mrs',
    fetch: polyphorm2MrsFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.volumeFieldRenderer;
      if (!renderer) return;
      const id = SOURCE_REGISTRY[Source.Polyphorm2MRS].id;
      // Renderer reads static config from the registry and per-frame knobs
      // from `state.settings.volumes.items`; settings row already exists (shippable).
      renderer.upload(id, cube);
      // Drives the first-load fade via the intent → fade bridge; a load completing
      // while toggled off snaps to opacity 0 until the field is enabled.
      syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
      // No echo: React reads per-field rows via `selectVolumeFieldItems`, an
      // engine-store projection — no callback fan-out needed.
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
