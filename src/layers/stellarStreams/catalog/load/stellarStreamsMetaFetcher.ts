/**
 * stellarStreamsMetaFetcher — the name sidecar. It runs the pair check only when the bin has
 * committed first; when the meta lands first, the bin fetcher runs it instead.
 */
import type { Fetcher } from '../../../../@types/loading/Fetcher';
import type { StellarStreamMeta } from '../@types/StellarStreamMeta';
import { HttpError, dataUrl } from '../../../../services/loading/fetchWithProgress';
import { streamPairMismatch } from '../utils/streamPairMismatch';

const STELLAR_STREAMS_META_PATH = 'stellar-streams/v1/stellar_streams_meta.json';

export function stellarStreamsMetaFetcher(
  binStreamCount: () => number | null,
): Fetcher<readonly StellarStreamMeta[], void> {
  return async (_req, signal) => {
    const url = dataUrl(STELLAR_STREAMS_META_PATH);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new HttpError(res.status, url);
    const meta: unknown = await res.json();
    if (!Array.isArray(meta)) throw new Error('stellar_streams_meta.json: root must be an array');
    // A pre-centreline meta would throw inside the ribbon upload and take labels and cards down with it.
    if (
      meta.length > 0 &&
      !(typeof meta[0] === 'object' && meta[0] !== null && 'centrelineMpc' in meta[0])
    ) {
      throw new Error(
        'stellar_streams_meta.json predates centrelineMpc: run npm run build-stellar-streams',
      );
    }
    const count = binStreamCount();
    const mismatch = count === null ? null : streamPairMismatch(count, meta.length);
    if (mismatch !== null) throw new Error(mismatch);
    return meta as StellarStreamMeta[];
  };
}
