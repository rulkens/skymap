/**
 * localBubbleSlot — factory for the shell's asset slot: its own fetcher and
 * its own renderer target. Construction-pure — builds and returns. A
 * Layer's slot lands in `state.layerSlots` (`createLayers`), never
 * `state.assetSlots`.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { localBubbleFetcher } from './localBubbleFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';

const EMPTY_VERTEX_ARRAY = new Float32Array(0);
const EMPTY_INDICES = new Uint32Array(0);

export function createLocalBubbleSlot(renderer: LocalBubbleRenderer): AssetSlot<ShellMesh, void> {
  return createAssetSlot({
    name: 'localBubble',
    fetch: localBubbleFetcher,
    commit: async (mesh) => {
      renderer.upload(mesh);
      // `decodeShellMesh` hands back VIEWS over the whole ~11 MB fetch buffer
      // (not copies), and `upload` writes them to GPU buffers synchronously
      // and never retains `mesh`; nothing else reads the shell's geometry
      // back, so drop the views here rather than let `AssetSlot.lastReady`
      // keep the entire underlying ArrayBuffer alive for the session.
      mesh.positions = EMPTY_VERTEX_ARRAY;
      mesh.normals = EMPTY_VERTEX_ARRAY;
      mesh.indices = EMPTY_INDICES;
    },
    onRelease: () => renderer.clearMesh(),
  });
}
