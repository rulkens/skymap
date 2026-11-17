/** stellarStreamsSlot — the particle bin's slot: commit uploads it, release frees the GPU buffer. */

import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { StellarStreamsPayload } from '../@types/StellarStreamsPayload';
import type { StellarStreamsRenderer } from '../../streaks/@types/StellarStreamsRenderer';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { stellarStreamsFetcher } from './stellarStreamsFetcher';

export function createStellarStreamsSlot(
  renderer: StellarStreamsRenderer,
  metaLength: () => number | null,
): AssetSlot<StellarStreamsPayload, void> {
  return createAssetSlot({
    name: 'stellarStreams',
    fetch: stellarStreamsFetcher(metaLength),
    commit: async (payload) => {
      renderer.upload(payload);
    },
    onRelease: () => renderer.clear(),
  });
}
