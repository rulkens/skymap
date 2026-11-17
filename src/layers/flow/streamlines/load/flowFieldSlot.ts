/**
 * flowFieldSlot — factory for the CF4++ velocity flow field's asset slot.
 * Lazy / default-off; the 'ready' transition
 * (`slotReady`) IS "uploaded to the renderer", since this commit returns
 * only after `upload` does.
 */

import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { flowFieldFetcher } from './flowFieldFetcher';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../../@types/data/volume/ScalarCube';
import type { FlowFieldRenderer } from '../@types/FlowFieldRenderer';

export function createFlowFieldSlot(renderer: FlowFieldRenderer): AssetSlot<ScalarCube, void> {
  const slot = createAssetSlot({
    name: 'flow',
    fetch: flowFieldFetcher,
    commit: async (cube) => {
      renderer.upload(cube);
    },
    onRelease: () => renderer.clear(),
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(`[engine] flow: ${s.value.dims.join('x')} velocity cube loaded`);
    }
  });
  return slot;
}
