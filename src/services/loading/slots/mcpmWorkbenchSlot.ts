/**
 * mcpmWorkbenchSlot — factory for the MCPM workbench promoted-export
 * volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to
 * `volumeFieldRenderer.upload` under the id `'mcpm-workbench'`.
 * The renderer reads per-cube static config (contrastCenter, envelope,
 * paletteId) from the registry and user-tunable knobs from
 * `state.settings.volumes.items` per frame — the commit replays no
 * renderer setter.
 *
 * **Lazy fetch.**  The registry entry is `visible: false` (hidden until
 * Phase 4 clears), so its construction seed lands `enabled: false` and
 * the slot stays idle at boot. No UI toggle exists to flip it yet — the
 * demand path only fires once one is added.
 *
 * **Settings row.**  The construction seed already created the entry in
 * `state.settings.volumes.items` before this commit fires, same as every
 * other shippable volume.
 */

import { createAssetSlot } from '../AssetSlot';
import { mcpmWorkbenchFetcher } from '../fetchers/mcpmWorkbenchFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createMcpmWorkbenchSlot: SlotFactory<ScalarCube, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'mcpmWorkbench',
    fetch: mcpmWorkbenchFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.volumeFieldRenderer;
      if (!renderer) return;
      const id = SOURCE_REGISTRY[Source.McpmWorkbench].id;
      renderer.upload(id, cube);
      syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
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
