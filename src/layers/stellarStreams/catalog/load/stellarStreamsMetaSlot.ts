/** stellarStreamsMetaSlot — the name sidecar's slot; a sidecar, so no commit step. */

import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { StellarStreamMeta } from '../@types/StellarStreamMeta';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { stellarStreamsMetaFetcher } from './stellarStreamsMetaFetcher';

export function createStellarStreamsMetaSlot(
  binStreamCount: () => number | null,
): AssetSlot<readonly StellarStreamMeta[], void> {
  return createAssetSlot({
    name: 'stellarStreamsMeta',
    fetch: stellarStreamsMetaFetcher(binStreamCount),
  });
}
