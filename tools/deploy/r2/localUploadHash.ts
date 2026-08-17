import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { R2Upload } from './R2Upload';
import { fileMd5 } from '../../utils/io/fileMd5';
import { shouldGzipOnWire } from './shouldGzipOnWire';

/**
 * The MD5 `syncGroup` compares against R2's ETag — for a file `uploadViaWrangler`
 * gzips on the wire, R2 stores the GZIPPED bytes, so the comparison must hash
 * those same bytes or every eligible file looks changed on every future run.
 * `gzipSync` is deterministic (its gzip header pins mtime to 0), so this is
 * stable run-to-run.
 */
export function localUploadHash(file: R2Upload): string {
  if (!shouldGzipOnWire(file.localPath)) return fileMd5(file.localPath);
  return createHash('md5')
    .update(gzipSync(readFileSync(file.localPath)))
    .digest('hex');
}
