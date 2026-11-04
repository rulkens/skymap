import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Streams `url` to `dest.part`, checks the sha256 of the decoded bytes (fetch inflates wire
 * gzip, and the inventory hashes raw bytes), then renames into place. Throws and leaves no
 * renamed file on an HTTP error or a mismatch.
 */
export async function downloadVerified(
  url: string,
  dest: string,
  sha256: string,
  onBytes: (n: number) => void,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || res.body === null) throw new Error(`${url}: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk);
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
      tap,
      createWriteStream(part),
    );
    if (hash.digest('hex') !== sha256) throw new Error(`${url}: sha256 mismatch`);
    await rename(part, dest);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
}
