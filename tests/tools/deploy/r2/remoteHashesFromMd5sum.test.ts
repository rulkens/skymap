/**
 * "On R2 without an MD5" (null) and "not on R2" (absent) lead to opposite
 * verdicts in the preflight, so the parse must never fold one into the other.
 */
import { describe, expect, it } from 'vitest';
import { remoteHashesFromMd5sum } from '../../../../tools/deploy/r2/remoteHashesFromMd5sum';

describe('remoteHashesFromMd5sum', () => {
  it('parses two-space lines, keeps spaces in keys and lowercases the hash', () => {
    const hashes = remoteHashesFromMd5sum(
      [
        'D047447A0FDB6B32C9A637EEF4D769ED  data/images/earth-tiles/v11/horizon/z5.idx',
        '0123456789abcdef0123456789abcdef  data/a b/c d.bin',
        '',
      ].join('\n'),
    );
    expect(hashes.get('data/images/earth-tiles/v11/horizon/z5.idx')).toBe(
      'd047447a0fdb6b32c9a637eef4d769ed',
    );
    expect(hashes.get('data/a b/c d.bin')).toBe('0123456789abcdef0123456789abcdef');
    expect(hashes.size).toBe(2);
  });

  it('maps an empty hash field to null, not absent', () => {
    const hashes = remoteHashesFromMd5sum('  data/raw/vesta.tif\n');
    expect(hashes.has('data/raw/vesta.tif')).toBe(true);
    expect(hashes.get('data/raw/vesta.tif')).toBeNull();
  });
});
