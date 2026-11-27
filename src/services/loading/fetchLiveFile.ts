import { fetchWithProgress } from '../../../packages/shared/src/services/loading/fetchWithProgress';
import { resolveLiveFileUrl } from './resolveLiveFileUrl';

/** Fetches a live dataset's newest file: the pointer first, then the dated file it names. */
export async function fetchLiveFile(
  id: string,
  name: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  return fetchWithProgress(await resolveLiveFileUrl(id, name, signal), signal, onProgress);
}
