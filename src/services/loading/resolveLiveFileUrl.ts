import type { LivePointer } from '../../@types/live/LivePointer';
import { livePointerPath } from '../../utils/live/livePointerPath';
import {
  dataUrl,
  HttpError,
} from '../../../packages/shared/src/services/loading/fetchWithProgress';

/**
 * The URL of a live dataset's newest file, read from its pointer. `no-cache` because the pointer is
 * the one mutable object; the dated file it names never changes and caches freely.
 */
export async function resolveLiveFileUrl(
  id: string,
  name: string,
  signal: AbortSignal,
): Promise<string> {
  const pointerUrl = dataUrl(livePointerPath(id));
  const res = await fetch(pointerUrl, { signal, cache: 'no-cache' });
  if (!res.ok) throw new HttpError(res.status, pointerUrl);
  const key = ((await res.json()) as LivePointer).files[name];
  if (!key) throw new Error(`live pointer ${pointerUrl} has no file "${name}"`);
  return dataUrl(key);
}
