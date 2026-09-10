/**
 * The one decision bakeSplats makes that tasks 1-6 don't already cover:
 * photoPoseFromStacItem names the JPEG bare and writeColmapModel hands that
 * name to `copyFile`, so the harvest directory must be folded in first. A
 * miss is silent at this level and shows up as Brush training on no images —
 * hence the assertion on the staged `images/` directory, not on the poses.
 *
 * cct and brush-cli are stubbed; the bake runs against a tmpdir cwd.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bakeSplats } from '../../../tools/scene-recon/bakeSplats';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { packPoints } from '../../../tools/scene-recon/pack/packPoints';

const ITEM_ID = '2025_84_40_1_0049_00002495_100mm';
const FIXTURE = fileURLToPath(new URL(`../../fixtures/skraafoto/${ITEM_ID}.json`, import.meta.url));

/** Header-only Brush export: enough properties for the reader, zero vertices. */
function emptyPly(): string {
  const properties = [
    'x',
    'y',
    'z',
    'scale_0',
    'scale_1',
    'scale_2',
    'rot_0',
    'rot_1',
    'rot_2',
    'rot_3',
    'opacity',
    'f_dc_0',
    'f_dc_1',
    'f_dc_2',
  ];
  return `ply\nformat binary_little_endian 1.0\nelement vertex 0\n${properties
    .map((name) => `property float ${name}\n`)
    .join('')}end_header\n`;
}

let root: string;
let previousCwd: string;

beforeAll(() => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'bake-splats-'));

  const collectionDir = join(root, 'data/raw/skraafoto', SOENDERMARKEN.skraafoto.collection);
  mkdirSync(collectionDir, { recursive: true });
  copyFileSync(FIXTURE, join(collectionDir, `${ITEM_ID}.json`));
  writeFileSync(join(collectionDir, `${ITEM_ID}.jpg`), 'jpeg-bytes');

  const lidarDir = join(root, 'public/data/geo3d/groups', SOENDERMARKEN.id, 'assets/lidar');
  mkdirSync(lidarDir, { recursive: true });
  writeFileSync(
    join(lidarDir, 'points.bin'),
    packPoints([{ xM: 0, yM: 0, zM: 0, r: 1, g: 2, b: 3, classification: 2 }]),
  );

  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

describe('bakeSplats', () => {
  it('stages every fetched JPEG into the COLMAP model', async () => {
    let staged: readonly string[] = [];

    const asset = await bakeSplats(SOENDERMARKEN, {
      runCct: async (_pipeline, lines) => lines.map(() => '0 0 0 inf'),
      runBrush: async (colmapDir) => {
        staged = readdirSync(join(colmapDir, 'images'));
        writeFileSync(join(colmapDir, 'final.ply'), emptyPly());
      },
      brushVersion: () => '0.1.0-test',
    });

    expect(staged).toEqual([`${ITEM_ID}.jpg`]);
    expect(asset.provenance.sourceVintage).toBe('2025-04-27');
  });
});
