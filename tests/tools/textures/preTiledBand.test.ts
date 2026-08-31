import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanPreTiledBand } from '../../../tools/textures/preTiledBand';

const PROVENANCE = {
  sourceId: 'test-pretiled',
  attribution: 'test attribution',
  vintage: 'test-vintage',
};

function tmpSourceDir(): string {
  return mkdtempSync(join(tmpdir(), 'pre-tiled-band-'));
}

/** A tile file only needs to exist under `<sourceDir>/<z>/<x>/<y>.webp` — its
 *  bytes are never read by the scan, only by `copyPreTiledBand` later. */
function writeRawTile(sourceDir: string, z: number, x: number, y: number): void {
  const path = join(sourceDir, String(z), String(x), `${y}.webp`);
  mkdirSync(join(sourceDir, String(z), String(x)), { recursive: true });
  writeFileSync(path, `stub-${z}-${x}-${y}`);
}

describe('scanPreTiledBand', () => {
  it('throws when a level in the range has no tiles on disk', () => {
    const sourceDir = tmpSourceDir();
    writeRawTile(sourceDir, 3, 0, 0);
    writeRawTile(sourceDir, 3, 1, 0);
    writeRawTile(sourceDir, 3, 0, 1);
    writeRawTile(sourceDir, 3, 1, 1);
    // z2 (the requested minLevel) is entirely absent.

    expect(() =>
      scanPreTiledBand({
        id: PROVENANCE.sourceId,
        provenance: PROVENANCE,
        sourceDir,
        minLevel: 2,
        maxLevel: 3,
      }),
    ).toThrow(/z2/);
  });

  it('throws when a level spans a gap instead of one contiguous rect', () => {
    const sourceDir = tmpSourceDir();
    // Rect implied by the bounding box is 2x2 = 4 tiles; only 3 are present.
    writeRawTile(sourceDir, 3, 0, 0);
    writeRawTile(sourceDir, 3, 1, 0);
    writeRawTile(sourceDir, 3, 0, 1);

    expect(() =>
      scanPreTiledBand({
        id: PROVENANCE.sourceId,
        provenance: PROVENANCE,
        sourceDir,
        minLevel: 3,
        maxLevel: 3,
      }),
    ).toThrow(/incomplete|gap/);
  });

  it("throws when a coarser level does not cover the deepest level's ground", () => {
    const sourceDir = tmpSourceDir();
    // z3's 2x2 block sits at tile (0,0)-(1,1); its true z2 parent is (0,0),
    // but the harvest's z2 tile instead sits at (2,0) — nowhere near it.
    writeRawTile(sourceDir, 3, 0, 0);
    writeRawTile(sourceDir, 3, 1, 0);
    writeRawTile(sourceDir, 3, 0, 1);
    writeRawTile(sourceDir, 3, 1, 1);
    writeRawTile(sourceDir, 2, 2, 0);

    expect(() =>
      scanPreTiledBand({
        id: PROVENANCE.sourceId,
        provenance: PROVENANCE,
        sourceDir,
        minLevel: 2,
        maxLevel: 3,
      }),
    ).toThrow(/z2/);
  });

  it("derives coverage from the deepest level's on-disk rect", () => {
    const sourceDir = tmpSourceDir();
    // z3 (8 columns x 4 rows at the shipped 512px tile edge, 45deg/tile):
    // the 2x2 block (0,0)-(1,1) is exactly z2 tile (0,0)'s own ground, so a
    // single z2 tile there legitimately covers it.
    writeRawTile(sourceDir, 3, 0, 0);
    writeRawTile(sourceDir, 3, 1, 0);
    writeRawTile(sourceDir, 3, 0, 1);
    writeRawTile(sourceDir, 3, 1, 1);
    writeRawTile(sourceDir, 2, 0, 0);

    const band = scanPreTiledBand({
      id: PROVENANCE.sourceId,
      provenance: PROVENANCE,
      sourceDir,
      minLevel: 2,
      maxLevel: 3,
    });

    // Hand-computed independently of the module under test: z3 has 8 columns
    // (512 << 3 / 512), so lonStep = latStep = 45deg; the (0,0)-(1,1) block
    // spans two tiles on each axis from the (-180, +90) NW corner.
    expect(band.coverage).toEqual([{ west: -180, east: -90, north: 90, south: 0 }]);
    expect(band.minLevel).toBe(2);
    expect(band.maxLevel).toBe(3);
    expect(band.tiles).toHaveLength(5); // 1 at z2 + 4 at z3
  });
});
