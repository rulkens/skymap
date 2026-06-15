/**
 * cf4DensitySlot — factory for the CF-4 DM density volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to
 * `volumeFieldRenderer.upload` under the id `'cf4-density'`.
 * The renderer reads per-cube static config (contrastCenter, envelope,
 * paletteId) from the registry and user-tunable knobs from
 * `state.settings.volumes.items` per frame — the commit replays no
 * renderer setter.
 *
 * **Lazy fetch.**  CF-4 is registry-visible:false, so its construction
 * seed lands `enabled: false` and the slot stays idle at boot.
 * Toggling the field on flips the bit and lazy-loads via
 * `engine.setVolumeFieldEnabled`, keeping a default-off CF-4 off the
 * boot bandwidth budget.
 *
 * **Settings row.**  CF-4 is a shippable volume, so the construction
 * seed already created the entry in `state.settings.volumes.items`
 * before this commit fires.
 */

import { createAssetSlot } from '../AssetSlot';
import { cf4DensityFetcher } from '../fetchers/cf4DensityFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createCf4DensitySlot: SlotFactory<ScalarCube, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.volumeFieldRenderer;
      if (!renderer) return;
      const id = SOURCE_REGISTRY[Source.Cf4Density].id;
      // Upload the cube; the renderer reads this field's per-cube static
      // config (contrastCenter, envelope, palette) from the registry and
      // its user-tunable knobs from `state.settings.volumes.items` per
      // frame, so the commit replays no renderer setter.  CF-4 is a
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
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
