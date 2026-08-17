import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Hex MD5 of a file's bytes — the digest R2 reports as a single-PUT object's ETag. */
export function fileMd5(localPath: string): string {
  return createHash('md5').update(readFileSync(localPath)).digest('hex');
}
