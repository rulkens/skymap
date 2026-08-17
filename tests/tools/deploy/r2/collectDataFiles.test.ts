/**
 * `collectDataFiles` reads the upload set off `manifest.json` rather than
 * walking disk — Task 11's post-pass already picked one hashed keeper per
 * logical name, so the manifest's values ARE the sweep. The drift guard is
 * the actual contract under test: syncing against a manifest that disagrees
 * with disk must throw before any byte moves, not upload a partial or stale
 * set and exit 0.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectDataFiles } from '../../../../tools/deploy/r2/collectDataFiles';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'collect-data-files-'));
  mkdirSync(join(dir, 'galaxy-catalog/v9'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeManifest(entries: Record<string, string>): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(entries, null, 2));
}

describe('collectDataFiles', () => {
  it('uploads exactly the hashed files the manifest names, keyed under data/', () => {
    writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.a3f19c2e.bin'), 'two-mrs-hashed-bytes');
    writeFileSync(join(dir, 'constellations.b1c2d3e4.json'), '{"constellations":true}');
    writeManifest({
      'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin',
      'constellations.json': 'constellations.b1c2d3e4.json',
    });

    const uploads = collectDataFiles(dir);
    const keys = uploads.map((u) => u.r2Key).sort();
    expect(keys).toEqual(
      ['data/galaxy-catalog/v9/2mrs.a3f19c2e.bin', 'data/constellations.b1c2d3e4.json'].sort(),
    );
  });

  it('refuses to sync when a tracked file was never hashed', () => {
    writeFileSync(join(dir, 'constellations.b1c2d3e4.json'), '{"constellations":true}');
    writeManifest({ 'constellations.json': 'constellations.b1c2d3e4.json' });
    // A fresh 2mrs.bin landed but build-data-manifest never ran over it —
    // it's still under its logical name and isn't in the manifest at all.
    writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.bin'), 'two-mrs-unhashed-bytes');

    expect(() => collectDataFiles(dir)).toThrow('galaxy-catalog/v9/2mrs.bin');
  });

  it('refuses to sync when the manifest names a file that is not on disk', () => {
    writeManifest({
      'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin',
    });
    // No 2mrs.a3f19c2e.bin written — the manifest is stale.

    expect(() => collectDataFiles(dir)).toThrow('galaxy-catalog/v9/2mrs.a3f19c2e.bin');
  });

  it('refuses to sync when there is no manifest at all', () => {
    writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.a3f19c2e.bin'), 'two-mrs-hashed-bytes');

    expect(() => collectDataFiles(dir)).toThrow('npm run build-data-manifest');
  });

  it('ignores untracked local artefacts', () => {
    writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.a3f19c2e.bin'), 'two-mrs-hashed-bytes');
    writeManifest({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' });
    // Pre-tier DisPerSE input — allowDataFile rejects it outright, so it must
    // neither trip the drift guard nor appear in the upload set.
    writeFileSync(join(dir, 'galaxy-catalog/v9/sdss.bin'), 'pre-tier-sdss-bytes');

    const uploads = collectDataFiles(dir);
    expect(uploads.some((u) => u.r2Key.includes('sdss'))).toBe(false);
    expect(uploads).toHaveLength(1);
  });
});
