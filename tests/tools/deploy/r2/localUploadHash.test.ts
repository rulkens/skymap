/**
 * The regression this guards against: R2 stores GZIPPED bytes for eligible
 * files (see uploadViaWrangler), so hashing the raw file here would make
 * etagMatches see a permanent mismatch and re-upload every eligible file on
 * every sync run forever.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { localUploadHash } from '../../../../tools/deploy/r2/localUploadHash';
import { fileMd5 } from '../../../../tools/utils/io/fileMd5';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'local-upload-hash-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('localUploadHash', () => {
  it('hashes the gzipped bytes for a gzip-eligible file', () => {
    const localPath = join(dir, 'sdss-medium.bin');
    writeFileSync(localPath, 'sdss-catalog-bytes-repeated-repeated-repeated');

    const expected = createHash('md5')
      .update(gzipSync(Buffer.from('sdss-catalog-bytes-repeated-repeated-repeated')))
      .digest('hex');
    expect(localUploadHash({ localPath, r2Key: 'data/sdss-medium.bin' })).toBe(expected);
  });

  it('falls back to the raw-file MD5 for an incompressible-exempt file (stars-*.bin)', () => {
    const localPath = join(dir, 'stars-medium.bin');
    writeFileSync(localPath, 'already-internally-compressed-star-bytes');

    expect(localUploadHash({ localPath, r2Key: 'data/stars-medium.bin' })).toBe(fileMd5(localPath));
  });
});
