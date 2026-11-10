/**
 * stellarStreamsFetcher — the particle bin. It runs the pair check only when the meta has
 * committed first; when the bin lands first, the meta fetcher runs it instead.
 */
import type { Fetcher } from '../../../../@types/loading/Fetcher';
import type { StellarStreamsPayload } from '../@types/StellarStreamsPayload';
import { dataUrl, fetchWithProgress } from '../../../../services/loading/fetchWithProgress';
import { decodeStellarStreams } from '../utils/decodeStellarStreams';
import { streamPairMismatch } from '../utils/streamPairMismatch';

const STELLAR_STREAMS_PATH = 'stellar-streams/v1/stellar-streams.bin';

export function stellarStreamsFetcher(
  metaLength: () => number | null,
): Fetcher<StellarStreamsPayload, void> {
  return async (_req, signal, onProgress) => {
    const buf = await fetchWithProgress(dataUrl(STELLAR_STREAMS_PATH), signal, onProgress);
    const payload = decodeStellarStreams(buf);
    const length = metaLength();
    const mismatch = length === null ? null : streamPairMismatch(payload.streamCount, length);
    if (mismatch !== null) throw new Error(mismatch);
    return payload;
  };
}
