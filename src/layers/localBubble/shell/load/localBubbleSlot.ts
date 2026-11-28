/** localBubbleSlot — factory for the shell's asset slot (own fetcher and renderer target). */

import { createAssetSlot } from '../../../../../packages/shared/src/services/loading/AssetSlot';
import { localBubbleFetcher } from './localBubbleFetcher';
import type { AssetSlot } from '../../../../../packages/shared/src/@types/loading/AssetSlot';
import type { ShellMesh } from '../../@types/ShellMesh';
import type { LocalBubbleRenderer } from '../@types/LocalBubbleRenderer';

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
