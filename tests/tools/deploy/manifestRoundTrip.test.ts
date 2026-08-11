/**
 * The writer↔reader seam: every other suite in this area hand-writes its own
 * `manifest.json` fixture, so a drift between `buildDataManifest`'s key
 * format and what `collectDataFiles`/`resolveDataFile` expect could leave
 * all of them green while every production fetch 404s (final-review-report.md,
 * I2). This test runs the real writer once and feeds its real output to both
 * readers — no hand-written manifest anywhere.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDataManifest } from '../../../tools/deploy/buildDataManifest';
import { collectDataFiles } from '../../../tools/deploy/r2/collectDataFiles';
import { resolveDataFile } from '../../../tools/utils/data/resolveDataFile';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'manifest-round-trip-'));
  mkdirSync(join(dir, 'galaxy-catalog/v9'), { recursive: true });
  mkdirSync(join(dir, 'star-catalog/v1'), { recursive: true });
  writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.bin'), 'two-mrs-bytes');
  writeFileSync(join(dir, 'star-catalog/v1/stars-small.bin'), 'stars-small-bytes');
  writeFileSync(join(dir, 'constellations.json'), '{"constellations":true}');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('manifest writer -> readers round trip', () => {
  it('collectDataFiles and resolveDataFile both resolve the real buildDataManifest output', () => {
    const manifest = buildDataManifest(dir);
    const logicalKeys = Object.keys(manifest).sort();
    expect(logicalKeys).toEqual(
      [
        'constellations.json',
        'galaxy-catalog/v9/2mrs.bin',
        'star-catalog/v1/stars-small.bin',
      ].sort(),
    );

    const uploads = collectDataFiles(dir);
    const uploadedR2Keys = uploads.map((u) => u.r2Key).sort();
    expect(uploadedR2Keys).toEqual(
      Object.values(manifest)
        .map((hashedRel) => `data/${hashedRel}`)
        .sort(),
    );

    for (const [logicalKey, hashedRel] of Object.entries(manifest)) {
      expect(resolveDataFile(dir, logicalKey)).toBe(join(dir, hashedRel));
    }
  });
});
