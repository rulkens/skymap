import { livePointerPath } from '../../utils/live/livePointerPath';
import type { LivePointer } from '../../@types/live/LivePointer';
import { dataUrl, fetchWithProgress, HttpError } from './fetchWithProgress';

/**
 * Fetches a live dataset's newest file: the pointer first (`no-cache`, since it is the one mutable
 * object), then the dated file it names, which never changes and caches freely.
 */
export async function fetchLiveFile(
  id: string,
  name: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const pointerUrl = dataUrl(livePointerPath(id));
  const res = await fetch(pointerUrl, { signal, cache: 'no-cache' });
  if (!res.ok) throw new HttpError(res.status, pointerUrl);
  const key = ((await res.json()) as LivePointer).files[name];
  if (!key) throw new Error(`live pointer ${pointerUrl} has no file "${name}"`);
  return fetchWithProgress(dataUrl(key), signal, onProgress);
}
