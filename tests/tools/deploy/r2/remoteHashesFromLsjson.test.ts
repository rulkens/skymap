/**
 * "On R2 without an MD5" (null) and "not on R2" (absent) lead to opposite
 * verdicts in the preflight, so the parse must never fold one into the other.
 */
import { describe, expect, it } from 'vitest';
import { remoteHashesFromLsjson } from '../../../../tools/deploy/r2/remoteHashesFromLsjson';

describe('remoteHashesFromLsjson', () => {
  it('keeps a hashless object as null and drops directory entries', () => {
    const hashes = remoteHashesFromLsjson(
      JSON.stringify([
        { Path: 'data/a.bin', IsDir: false, Hashes: { md5: 'ABC' } },
        { Path: 'data/raw/meshes/vesta.tif', IsDir: false, Hashes: {} },
        { Path: 'data/images', IsDir: true },
      ]),
    );
    expect(hashes.get('data/a.bin')).toBe('abc');
    expect(hashes.has('data/raw/meshes/vesta.tif')).toBe(true);
    expect(hashes.get('data/raw/meshes/vesta.tif')).toBeNull();
    expect(hashes.has('data/images')).toBe(false);
  });
});
