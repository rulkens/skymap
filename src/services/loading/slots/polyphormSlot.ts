/**
 * polyphormSlot — factory for the Polyphorm 2MRS volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to
 * `volumeFieldRenderer.upload` under the id `'polyphorm'`.
 * The renderer reads per-cube static config (contrastCenter, envelope,
 * paletteId) from the registry and user-tunable knobs from
 * `state.settings.volumes.items` per frame — the commit replays no
 * renderer setter.
 *
 * **Lazy fetch.**  Polyphorm is registry-visible:false, so its construction
 * seed lands `enabled: false` and the slot stays idle at boot.
 * Toggling the field on dispatches `writeVolumeField`, which flips the
 * `enabled` bit and triggers a demand-reevaluation load — keeping
 * default-off Polyphorm off the boot bandwidth budget.
 *
 * **Settings row.**  Polyphorm is a shippable volume, so the construction
 * seed already created the entry in `state.settings.volumes.items`
 * before this commit fires.
 */

import { createAssetSlot } from '../AssetSlot';
import { polyphormFetcher } from '../fetchers/polyphormFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createPolyphormSlot: SlotFactory<ScalarCube, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'polyphorm',
    fetch: polyphormFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.volumeFieldRenderer;
      if (!renderer) return;
      const id = SOURCE_REGISTRY[Source.Polyphorm].id;
      // Upload the cube; the renderer reads this field's per-cube static
      // config (contrastCenter, envelope, palette) from the registry and
      // its user-tunable knobs from `state.settings.volumes.items` per
      // frame, so the commit replays no renderer setter.  Polyphorm is a
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
        `[engine] polyphorm: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
