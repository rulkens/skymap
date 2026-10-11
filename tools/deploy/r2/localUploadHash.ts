import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { R2Upload } from '../@types/R2Upload';
import { fileMd5 } from '../../utils/io/fileMd5';

/**
 * The MD5 `syncGroup` compares against R2's ETag — when the group's flag has
 * `uploadViaWrangler` gzip on the wire, R2 stores the GZIPPED bytes, so the
 * comparison must hash those same bytes or the file looks changed on every run.
 * `gzipSync` is deterministic (its gzip header pins mtime to 0), so this is
 * stable run-to-run.
 */
export function localUploadHash(file: R2Upload, gzipOnWire: boolean): string {
  if (!gzipOnWire) return fileMd5(file.localPath);
  return createHash('md5')
    .update(gzipSync(readFileSync(file.localPath)))
    .digest('hex');
}
