import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDataFile } from '../../../../tools/utils/data/resolveDataFile';

describe('resolveDataFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resolve-data-file-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the hashed path the manifest names', () => {
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }),
    );

    expect(resolveDataFile(dir, 'galaxy-catalog/v9/2mrs.bin')).toBe(
      join(dir, 'galaxy-catalog/v9/2mrs.a3f19c2e.bin'),
    );
  });

  it('falls back to the logical path for a file the manifest does not name', () => {
    // The sdss.bin case: buildFilaments reads a mix of tracked/hashed
    // (2mrs.bin) and untracked/logical (sdss.bin, glade.bin) files.
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }),
    );

    expect(resolveDataFile(dir, 'galaxy-catalog/v9/sdss.bin')).toBe(
      join(dir, 'galaxy-catalog/v9/sdss.bin'),
    );
  });

  it('falls back to the logical path when there is no manifest at all', () => {
    // A checkout that has never run buildDataManifest must still be able to
    // run the verifiers against plain, un-hashed files.
    expect(resolveDataFile(dir, 'galaxy-catalog/v9/sdss.bin')).toBe(
      join(dir, 'galaxy-catalog/v9/sdss.bin'),
    );
  });
});
