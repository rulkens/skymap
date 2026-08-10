/**
 * `collectDataManifest` is the manifest's own upload row — mirrors
 * `collectEarthTileManifest`. The empty-directory case is the one that
 * matters: a silently-empty group here would let `buildGroups()` upload
 * fresh hashed data behind a stale `manifest.json` still pointing at the
 * previous generation, which is the exact failure the whole drift-guard
 * regime exists to prevent.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectDataManifest } from '../../../../tools/deploy/r2/collectDataManifest';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'collect-data-manifest-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('collectDataManifest', () => {
  it('emits the manifest under data/manifest.json', () => {
    writeFileSync(
      join(dir, 'manifest.json'),
      '{"constellations.json":"constellations.b1c2d3e4.json"}',
    );

    const uploads = collectDataManifest(dir);
    expect(uploads).toEqual([
      { localPath: join(dir, 'manifest.json'), r2Key: 'data/manifest.json' },
    ]);
  });

  it('emits nothing when the manifest is absent', () => {
    expect(collectDataManifest(dir)).toEqual([]);
  });
});
