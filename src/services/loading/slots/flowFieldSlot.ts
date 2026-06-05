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
 * **GPU upload deferred to Phase C.**  The commit's job is normally to hand the
 * decoded cube to its renderer (cf4Density → `scalarVolumeRenderer.addField`).
 * The flow renderer that receives this cube — `flowFieldFromCube(device, cube)`
 * → the renderer's `setField` — lands in Phase C; it does not exist yet.  So
 * Phase B's commit proves the demand → fetch → decode → commit path end to end
 * (record the layer loaded, wake the render loop) and DEFERS the GPU upload to
 * Phase C with the comment below.  Adding a renderer stub now would be out of
 * scope and dead.
 *
 * Construction-pure: builds + subscribes + RETURNS the slot.  The orchestrator
 * (`installSlots`) owns the write to `state.assetSlots`.
 */

import { createAssetSlot } from '../AssetSlot';
import { flowFieldFetcher } from '../fetchers/flowFieldFetcher';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFlowFieldSlot: SlotFactory<ScalarCube, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'flow',
    fetch: flowFieldFetcher,
    commit: async (cube) => {
      // Phase C uploads the cube to the GPU here — `flowFieldFromCube(state.gpu.device, cube)`
      // then handing the resulting FlowField to the flow renderer's `setField`, once that
      // renderer exists. Phase B proves the demand→fetch→decode→commit path: record the
      // layer as loaded and wake the render loop. The cube is intentionally unused until then.
      void cube;
      state.data.flow.setLoaded();
      state.subsystems.scheduler.requestRender();
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(`[engine] flow: ${s.value.dims.join('x')} velocity cube loaded`);
    }
  });
  return slot;
};
