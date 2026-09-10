/**
 * Covers the decisions that live only in the orchestrator, each of which fails
 * silently: the bare `<id>.jpg` resolved against the harvest directory before
 * `writeColmapModel` copies it (assert on the staged `images/`, not the poses); a
 * previous bake's `final.ply` cleared; an empty export not shipped as a stub .bin.
 *
 * cct and brush-cli are stubbed and the bake runs against a tmpdir cwd, so
 * this file needs vitest's `forks` pool — `process.chdir` is undefined under
 * `threads`, and `vitest.config.ts` sets no `pool` (v4 defaults to forks).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bakeSplats } from '../../../tools/scene-recon/bakeSplats';
import { SOENDERMARKEN } from '../../../tools/scene-recon/groups/soendermarken';
import { packPoints } from '../../../tools/scene-recon/pack/packPoints';

const ITEM_ID = '2025_84_40_1_0049_00002495_100mm';
const FIXTURE = fileURLToPath(new URL(`../../fixtures/skraafoto/${ITEM_ID}.json`, import.meta.url));

const PLY_PROPERTIES = [
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

/** A Brush export at shDegree 0 whose vertices are all-zero bytes — the reader
 *  only needs the header to be honest about the count. */
function ply(vertexCount: number): Uint8Array {
  const header =
    'ply\nformat binary_little_endian 1.0\n' +
    `element vertex ${vertexCount}\n` +
    `${PLY_PROPERTIES.map((name) => `property float ${name}\n`).join('')}end_header\n`;
  const headerBytes = new TextEncoder().encode(header);
  const bytes = new Uint8Array(headerBytes.length + vertexCount * PLY_PROPERTIES.length * 4);
  bytes.set(headerBytes);
  return bytes;
}

let root: string;
let previousCwd: string;
let stalePlyPath: string;

beforeAll(() => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'bake-splats-'));

  const collectionDir = join(root, 'data/raw/skraafoto', SOENDERMARKEN.skraafoto.collection);
  mkdirSync(collectionDir, { recursive: true });

  // A previous bake's export, left where this one will look for its own.
  stalePlyPath = join(collectionDir, `colmap-${SOENDERMARKEN.id}`, 'final.ply');
  mkdirSync(join(collectionDir, `colmap-${SOENDERMARKEN.id}`), { recursive: true });
  writeFileSync(stalePlyPath, ply(9));

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

const RUN_CCT = async (_pipeline: string, lines: readonly string[]) => lines.map(() => '0 0 0 inf');

describe('bakeSplats', () => {
  it('stages every fetched JPEG into the COLMAP model', async () => {
    let staged: readonly string[] = [];
    let staleSurvived = true;

    const asset = await bakeSplats(SOENDERMARKEN, {
      runCct: RUN_CCT,
      runBrush: async (colmapDir) => {
        staged = readdirSync(join(colmapDir, 'images'));
        staleSurvived = existsSync(stalePlyPath);
        writeFileSync(join(colmapDir, 'final.ply'), ply(1));
      },
      brushVersion: () => '0.1.0-test',
    });

    expect(staged).toEqual([`${ITEM_ID}.jpg`]);
    // Brush must never be able to hand back the previous run's export.
    expect(staleSurvived).toBe(false);
    expect(asset.splatCount).toBe(1);
    expect(asset.provenance.sourceVintage).toBe('2025-04-27');
  });

  it('refuses an export with no splats in it', async () => {
    await expect(
      bakeSplats(SOENDERMARKEN, {
        runCct: RUN_CCT,
        runBrush: async (colmapDir) => {
          writeFileSync(join(colmapDir, 'final.ply'), ply(0));
        },
        brushVersion: () => '0.1.0-test',
      }),
    ).rejects.toThrow(/zero splats/);
  });
});
