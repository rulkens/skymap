/**
 * flowFieldSlot — factory for the CF4++ velocity flow field's asset slot.
 * Lazy / default-off; the 'ready' transition
 * (`slotReady`) IS "uploaded to the renderer", since this commit returns
 * only after `upload` does.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { flowFieldFetcher } from './flowFieldFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { FlowFieldRenderer } from '../../../@types/rendering/FlowFieldRenderer';

const EMPTY_VOXELS = new Uint16Array(0);

export function createFlowFieldSlot(renderer: FlowFieldRenderer): AssetSlot<ScalarCube, void> {
  const slot = createAssetSlot({
    name: 'flow',
    fetch: flowFieldFetcher,
    commit: async (cube) => {
      renderer.upload(cube);
      // `upload` copies `voxels` into a GPU 3D texture and never retains the
      // cube; nothing else reads it back (`AssetSlot.lastReady` would
      // otherwise hold this tens-of-MB f16 buffer for the rest of the
      // session — the flow cube is the largest single fetch in the app).
      // `readonly` is a compile-time-only guard here.
      (cube as { voxels: Uint16Array }).voxels = EMPTY_VOXELS;
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(`[engine] flow: ${s.value.dims.join('x')} velocity cube loaded`);
    }
  });
  return slot;
}
