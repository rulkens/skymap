/**
 * localBubbleSlot — factory for the shell's asset slot: its own fetcher and
 * its own renderer target. Construction-pure — builds and returns; the
 * Layer's asset row carries it.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { localBubbleFetcher } from './localBubbleFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';

export function createLocalBubbleSlot(renderer: LocalBubbleRenderer): AssetSlot<ShellMesh, void> {
  return createAssetSlot({
    name: 'localBubble',
    fetch: localBubbleFetcher,
    commit: async (mesh) => {
      renderer.upload(mesh);
    },
    onRelease: () => renderer.clearMesh(),
  });
}
