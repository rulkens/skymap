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
 * `setField`, which owns the upload (it builds the 3D velocity texture via
 * `flowFieldFromCube` against its own device — the device never leaks to this
 * slot, mirroring `cf4Density → scalarVolumeRenderer.addField`).  `setLoaded()`
 * means "committed to the renderer" (see `FlowFieldStore`), so it fires AFTER
 * `setField`, then the render loop wakes.  A null renderer (pre-bootstrap) is a
 * silent no-op.
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
      // Hand the cube to the renderer, which uploads it to the GPU and binds
      // it. setLoaded() runs AFTER setField so "loaded" truthfully means
      // "committed to the renderer".
      state.gpu.flowFieldRenderer?.setField(cube);
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
