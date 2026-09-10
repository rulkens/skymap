/**
 * Brush reports a bad COLMAP frame as a blurry splat rather than an error, so
 * the quaternion and translation columns are goldens derived on paper in the
 * comments below — never by calling the writer's own conjugate/matrix code.
 */
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { packPoints, type ScenePoint } from '../../../../tools/scene-recon/pack/packPoints';
import { writeColmapModel } from '../../../../tools/scene-recon/splats/writeColmapModel';
import type { PhotoPose } from '../../../../tools/scene-workbench/@types/PhotoPose';

// float32-exact coordinates, so packPoints' narrowing to f32 is not a source of
// drift between these literals and the text the writer emits.
const TEN_POINTS: readonly ScenePoint[] = [
  { xM: 0, yM: 0, zM: 0, r: 0, g: 0, b: 0, classification: 2 },
  { xM: 1, yM: 2, zM: 3, r: 10, g: 20, b: 30, classification: 2 },
  { xM: -1.5, yM: 2.25, zM: -3.75, r: 40, g: 50, b: 60, classification: 6 },
  { xM: 4, yM: 5, zM: 6, r: 70, g: 80, b: 90, classification: 2 },
  { xM: 7.5, yM: -8.25, zM: 9, r: 100, g: 110, b: 120, classification: 2 },
  { xM: 10, yM: 11, zM: 12, r: 130, g: 140, b: 150, classification: 5 },
  { xM: -13, yM: 14.5, zM: 15, r: 160, g: 170, b: 180, classification: 2 },
  { xM: 16, yM: 17, zM: 18, r: 190, g: 200, b: 210, classification: 2 },
  { xM: 19.125, yM: 20, zM: -21, r: 220, g: 230, b: 240, classification: 2 },
  { xM: 22, yM: 23, zM: 24, r: 250, g: 251, b: 252, classification: 9 },
];

let root: string;
let poses: readonly PhotoPose[];
let pointsBinPath: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'colmap-model-'));
  pointsBinPath = join(root, 'points.bin');
  writeFileSync(pointsBinPath, packPoints(TEN_POINTS));
  writeFileSync(join(root, 'photo_a.jpg'), 'jpeg-a');
  writeFileSync(join(root, 'photo_b.jpg'), 'jpeg-b');

  poses = [
    {
      id: 'photo_a',
      positionM: [10, 20, 30],
      rotation: [0, 0, 0, 1],
      focalLengthPx: 1000,
      principalPointPx: [400, 300],
      imageWidthPx: 800,
      imageHeightPx: 600,
      imageUrl: join(root, 'photo_a.jpg'),
    },
    {
      id: 'photo_b',
      positionM: [100, 50, 25],
      // (x, y, z, w) = (0, 0, 0.6, 0.8): a rotation about +Z whose components
      // AND whose matrix terms are all exact in binary floating point — unlike
      // the 45° half-angle of a 90° turn, where √½ leaves dust in every cell.
      rotation: [0, 0, 0.6, 0.8],
      focalLengthPx: 1200,
      principalPointPx: [512, 384],
      imageWidthPx: 1024,
      imageHeightPx: 768,
      imageUrl: join(root, 'photo_b.jpg'),
    },
  ];
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function writeModel(outName: string, pointSampleTarget: number): Promise<string> {
  const outDir = join(root, outName);
  await writeColmapModel({ poses, pointsBinPath, pointSampleTarget, outDir });
  return outDir;
}

describe('writeColmapModel', () => {
  it('writes cameras.txt with one PINHOLE entry per image', async () => {
    const outDir = await writeModel('cameras', 10);
    expect(readFileSync(join(outDir, 'cameras.txt'), 'utf8')).toBe(
      '1 PINHOLE 800 600 1000 1000 400 300\n2 PINHOLE 1024 768 1200 1200 512 384\n',
    );
  });

  it('writes images.txt with the world→camera conjugate quaternion and translation', async () => {
    const outDir = await writeModel('images-txt', 10);
    // photo_a: identity, so the conjugate is identity and t = -I·(10,20,30).
    //
    // photo_b: q_group←cam = (x,y,z,w) = (0,0,0.6,0.8); its conjugate, written
    // scalar-first, is (0.8, -0, -0, -0.6) and its matrix (world←camera) is
    //   [ 1-2·0.36     2·0.8·0.6   0 ]   [  0.28  0.96  0 ]
    //   [ -2·0.8·0.6   1-2·0.36    0 ] = [ -0.96  0.28  0 ]
    //   [ 0            0           1 ]   [  0     0     1 ]
    // t = -R·(100,50,25) = -(28+48, -96+14, 25) = (-76, 82, -25).
    expect(readFileSync(join(outDir, 'images.txt'), 'utf8')).toBe(
      '1 1 0 0 0 -10 -20 -30 1 photo_a.jpg\n' +
        '\n' +
        '2 0.8 0 0 -0.6 -76 82 -25 2 photo_b.jpg\n' +
        '\n',
    );
  });

  it('writes points3D.txt with every point when the target covers the cloud', async () => {
    const outDir = await writeModel('points-all', 10);
    expect(readFileSync(join(outDir, 'points3D.txt'), 'utf8')).toBe(
      '1 0 0 0 0 0 0 0\n' +
        '2 1 2 3 10 20 30 0\n' +
        '3 -1.5 2.25 -3.75 40 50 60 0\n' +
        '4 4 5 6 70 80 90 0\n' +
        '5 7.5 -8.25 9 100 110 120 0\n' +
        '6 10 11 12 130 140 150 0\n' +
        '7 -13 14.5 15 160 170 180 0\n' +
        '8 16 17 18 190 200 210 0\n' +
        '9 19.125 20 -21 220 230 240 0\n' +
        '10 22 23 24 250 251 252 0\n',
    );
  });

  it('writes points3D.txt sampling every Nth point of points.bin', async () => {
    // 10 points, target 3 → N = 3, keeping indices 0, 3, 6, 9.
    const outDir = await writeModel('points-sampled', 3);
    expect(readFileSync(join(outDir, 'points3D.txt'), 'utf8')).toBe(
      '1 0 0 0 0 0 0 0\n' +
        '2 4 5 6 70 80 90 0\n' +
        '3 -13 14.5 15 160 170 180 0\n' +
        '4 22 23 24 250 251 252 0\n',
    );
  });

  it('copies each pose image into outDir/images under its images.txt name', async () => {
    const outDir = await writeModel('images-dir', 10);
    expect(readFileSync(join(outDir, 'images', 'photo_a.jpg'), 'utf8')).toBe('jpeg-a');
    expect(readFileSync(join(outDir, 'images', 'photo_b.jpg'), 'utf8')).toBe('jpeg-b');
    // Real bytes, not a link: the staged model gets moved to the training host.
    expect(lstatSync(join(outDir, 'images', 'photo_a.jpg')).isSymbolicLink()).toBe(false);
  });
});
