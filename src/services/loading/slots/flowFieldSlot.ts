/**
 * flowFieldSlot — factory for the CF4++ velocity flow field's asset slot.
 *
 * **Lazy / default-off.**  Mirrors `cf4DensitySlot`: the factory mints the
 * slot unconditionally, but the flow layer's enable bit (`state.data.flow.
 * enabled`) defaults false, so the slot stays idle at boot.  Toggling flow on
 * (Phase D UI) flips the bit and the per-frame `reevaluateDemand` fires
 * `flowFieldFetcher` — the ~tens-of-MB velocity cube is paid only on opt-in,
 * never on every page load.
 *
 * **GPU upload.**  The commit hands the decoded cube to the flow renderer's
 * `upload`, which builds the 3D velocity texture via `flowFieldFromCube` against
 * its own device — the device never leaks to this slot, mirroring
 * `cf4Density → scalarVolumeRenderer.addField`.  `setLoaded()` means "committed
 * to the renderer" (see `FlowFieldStore`), so it fires AFTER
 * `upload`.  The render wake is `installSlotReadyWake`'s job, not the
 * factory's.  A null renderer (pre-bootstrap) is a silent no-op.
 *
 * Construction-pure: builds + subscribes + RETURNS the slot.  The orchestrator
 * (`installSlots`) owns the write to `state.assetSlots`.
 */

import { createAssetSlot } from '../AssetSlot';
import { flowFieldFetcher } from '../fetchers/flowFieldFetcher';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFlowFieldSlot: SlotFactory<ScalarCube, void> = (state, _cb) => {
  // Register the flow fade handle at opacity 0; the commit's
  // fadeTo(1, FADE_IN_DURATION_MS) ramps it in once the upload lands. The
  // handle (engine.ts) owns the re-enable (cube already resident) + fade-out
  // branches — see the fade design in `EngineFlowFieldsHandle`.
  state.subsystems.fades.register({ kind: 'flow' }, 0);

  const slot = createAssetSlot({
    name: 'flow',
    fetch: flowFieldFetcher,
    commit: async (cube) => {
      // Hand the cube to the renderer, which uploads it to the GPU and binds
      // it. setLoaded() runs AFTER upload so "loaded" truthfully means
      // "committed to the renderer".
      state.gpu.flowFieldRenderer?.upload(cube);
      state.data.flow.setLoaded();
      // Fade in only if the setting still requests flow visible. A load that
      // completes after the user toggled off must not visibly render; the
      // pass.enabled() gate keeps anything with opacity > 0 drawing, so
      // gating here keeps the fade honest to the user's intent at the moment
      // the cube lands. This is the FIRST-enable fade-in; the handle owns the
      // re-enable + fade-out branches.
      if (state.settings.flow.enabled) {
        void state.subsystems.fades.fadeTo({ kind: 'flow' }, 1, FADE_IN_DURATION_MS);
      }
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(`[engine] flow: ${s.value.dims.join('x')} velocity cube loaded`);
    }
  });
  return slot;
};
