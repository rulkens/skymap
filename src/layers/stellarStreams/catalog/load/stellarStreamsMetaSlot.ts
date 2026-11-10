/** stellarStreamsMetaSlot — the meta sidecar's slot: commit builds the pick ribbons, release frees them. */

import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { StellarStreamMeta } from '../@types/StellarStreamMeta';
import type { StellarStreamsRibbonPickRenderer } from '../../streaks/@types/StellarStreamsRibbonPickRenderer';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { stellarStreamsMetaFetcher } from './stellarStreamsMetaFetcher';

export function createStellarStreamsMetaSlot(
  ribbonPick: StellarStreamsRibbonPickRenderer,
  binStreamCount: () => number | null,
): AssetSlot<readonly StellarStreamMeta[], void> {
  return createAssetSlot({
    name: 'stellarStreamsMeta',
    fetch: stellarStreamsMetaFetcher(binStreamCount),
    commit: async (meta) => {
      ribbonPick.upload(meta);
    },
    onRelease: () => ribbonPick.clear(),
  });
}
