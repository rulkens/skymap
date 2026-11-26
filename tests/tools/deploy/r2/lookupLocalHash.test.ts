/**
 * A stale cache hit is a wrong skip (new bytes never upload) or a false clash in
 * the immutable-key preflight, so any change to the file must miss.
 */
import { describe, expect, it } from 'vitest';
import { localHashCacheKey } from '../../../../tools/deploy/r2/localHashCacheKey';
import { lookupLocalHash } from '../../../../tools/deploy/r2/lookupLocalHash';

const PATH = 'public/data/images/mars-tiles/v3/horizon/z3.idx';
const STAT = { size: 4096, mtimeMs: 1_764_000_000_000.5 };
const cache = { [localHashCacheKey(PATH, false)]: { ...STAT, md5: 'raw-md5' } };

describe('lookupLocalHash', () => {
  it('hits while size and mtime are unchanged', () => {
    expect(lookupLocalHash(cache, PATH, false, STAT)).toBe('raw-md5');
  });

  it('misses once the file is rewritten, even at the same size', () => {
    expect(lookupLocalHash(cache, PATH, false, { ...STAT, mtimeMs: STAT.mtimeMs + 1 })).toBeNull();
    expect(lookupLocalHash(cache, PATH, false, { ...STAT, size: STAT.size + 1 })).toBeNull();
  });

  it('never hands the raw MD5 to a gzip-on-wire lookup', () => {
    expect(lookupLocalHash(cache, PATH, true, STAT)).toBeNull();
  });
});
