import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UpstreamChangedError } from '../UpstreamChangedError';

/**
 * Streams `url` to `dest.part`, checks the sha256 of the decoded bytes (fetch inflates wire
 * gzip, and the inventory hashes raw bytes), then renames into place. Throws and leaves no
 * renamed file on an HTTP error, a mismatch, `idleMs` without a byte, or an aborted `signal`.
 */
export async function downloadVerified(
  url: string,
  dest: string,
  sha256: string,
  idleMs: number,
  signal: AbortSignal,
  onBytes: (n: number) => void,
): Promise<void> {
  const abort = new AbortController();
  let idle: NodeJS.Timeout | undefined;
  const rearm = (): void => {
    clearTimeout(idle);
    idle = setTimeout(() => abort.abort(new Error(`no data for ${idleMs} ms`)), idleMs);
  };
  const part = `${dest}.part`;
  try {
    rearm();
    const res = await fetch(url, { signal: AbortSignal.any([signal, abort.signal]) });
    if (res.status === 404) throw new UpstreamChangedError('HTTP 404');
    if (!res.ok || res.body === null) throw new Error(`HTTP ${res.status}`);
    await mkdir(dirname(dest), { recursive: true });
    const hash = createHash('sha256');
    const tap = new Transform({
      transform(chunk: Buffer, _enc, done) {
        rearm();
        hash.update(chunk);
        onBytes(chunk.length);
        done(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
      tap,
      createWriteStream(part),
      { signal: AbortSignal.any([signal, abort.signal]) },
    );
    if (hash.digest('hex') !== sha256) throw new UpstreamChangedError('sha256 mismatch');
    await rename(part, dest);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  } finally {
    clearTimeout(idle);
  }
}
