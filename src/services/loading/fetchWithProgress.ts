/**
 * fetchWithProgress — streaming fetch with per-chunk progress events.
 *
 * Lifted from the original cloudLoader.fetchWithProgress with two changes:
 *   1. The `LoadEventSource`-tagged union API is gone.  The slot translates
 *      raw `(loaded, total)` callbacks into LoadEvents itself, keeping the
 *      I/O layer ignorant of the slot's state machine.
 *   2. Non-2xx responses throw HttpError rather than a plain Error, so
 *      retryPolicy can branch on status without parsing message strings.
 *
 * The streaming approach (rather than `res.arrayBuffer()`) is what makes the
 * loading-bar UI honest — we observe bytes as they arrive instead of seeing
 * one binary "click → 5 s silence → done".  See the original cloudLoader
 * docblock for the full rationale.
 */

import { dataBaseUrl } from '../../utils/network/dataBaseUrl';
import { resolveDataPath } from './dataManifest';

/**
 * Build a runtime URL for a `.bin` (or other static-data) asset. Joins
 * `dataBaseUrl()` with the manifest-resolved hashed path (the boot-fetched
 * `DataManifest` — see `dataManifest.ts`); identity when nothing's hashed.
 */
export function dataUrl(filename: string): string {
  return `${dataBaseUrl()}/data/${resolveDataPath(filename)}`;
}

/**
 * Thrown from `fetchWithProgress` on non-2xx responses.  Carries `.status`
 * so retryPolicy can decide retry-vs-give-up on status alone.  Co-located
 * with the throw site (rather than a shared `errors.ts`) so the policy
 * module's import graph stays simple.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export async function fetchWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);

  const totalHeader = res.headers.get('Content-Length');
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0;
  onProgress(0, total);

  // Some shims don't expose body as a stream; degrade to all-at-once
  // (no per-chunk progress) but still emit a final progress event so the
  // bar ratchets to full before finishing.
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.byteLength;
  }
  return combined.buffer;
}
