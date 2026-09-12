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
  writeFileSync(join(root, 'photo_c.jpg'), 'jpeg-c');

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
    {
      id: 'photo_c',
      positionM: [10, 20, 30],
      // All four components equal, so every cross term of the quaternion→matrix
      // expansion is non-zero and every column of the conjugate is signed —
      // the pure-Z fixtures above leave x, y and four matrix cells at zero,
      // where a dropped negation or a swapped term would print the same text.
      rotation: [0.5, 0.5, 0.5, 0.5],
      focalLengthPx: 1500,
      principalPointPx: [800, 600],
      imageWidthPx: 1600,
      imageHeightPx: 1200,
      imageUrl: join(root, 'photo_c.jpg'),
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
      '1 PINHOLE 800 600 1000 1000 400 300\n' +
        '2 PINHOLE 1024 768 1200 1200 512 384\n' +
        '3 PINHOLE 1600 1200 1500 1500 800 600\n',
    );
  });

  it('writes images.txt with the world→camera conjugate quaternion and translation', async () => {
    const outDir = await writeModel('images-txt', 10);
    // photo_a: identity, so the conjugate is identity and t = -I·(10,20,30).
    //
    // photo_b: q_group←cam = (x,y,z,w) = (0,0,0.6,0.8); its conjugate, written
    // scalar-first, is (0.8, -0, -0, -0.6) and its matrix (camera←world) is
    //   [ 1-2·0.36     2·0.8·0.6   0 ]   [  0.28  0.96  0 ]
    //   [ -2·0.8·0.6   1-2·0.36    0 ] = [ -0.96  0.28  0 ]
    //   [ 0            0           1 ]   [  0     0     1 ]
    // t = -R·(100,50,25) = -(28+48, -96+14, 25) = (-76, 82, -25).
    //
    // photo_c: q = (0.5,0.5,0.5,0.5); conjugate scalar-first (0.5,-0.5,-0.5,-0.5).
    // Every product of two components is ±0.25, so each matrix cell is 0 or ±1
    // exactly:  m00 = 1-2(0.25+0.25) = 0,  m01 = 2(0.25+0.25) = 1,
    // m02 = 2(0.25-0.25) = 0 — and likewise down the rows, giving the cyclic
    // permutation [[0,1,0],[0,0,1],[1,0,0]].
    // t = -R·(10,20,30) = -(20, 30, 10) = (-20, -30, -10).
    expect(readFileSync(join(outDir, 'images.txt'), 'utf8')).toBe(
      '1 1 0 0 0 -10 -20 -30 1 photo_a.jpg\n' +
        '\n' +
        '2 0.8 0 0 -0.6 -76 82 -25 2 photo_b.jpg\n' +
        '\n' +
        '3 0.5 -0.5 -0.5 -0.5 -20 -30 -10 3 photo_c.jpg\n' +
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
    expect(readFileSync(join(outDir, 'images', 'photo_c.jpg'), 'utf8')).toBe('jpeg-c');
    // Real bytes, not a link: the staged model gets moved to the training host.
    expect(lstatSync(join(outDir, 'images', 'photo_a.jpg')).isSymbolicLink()).toBe(false);
  });
});

/**
 * Two cameras with identity rotation 10 m apart along +X, f = 100 px and
 * 100 × 80 frames, so the half-width is `|x_cam / z| < 0.5` and every
 * projection below is exact in binary floating point.
 */
describe('writeColmapModel with observations', () => {
  const OBSERVED_POINTS: readonly ScenePoint[] = [
    { xM: 4, yM: 0, zM: 40, r: 10, g: 20, b: 30, classification: 2 },
    { xM: 8, yM: 8, zM: 40, r: 40, g: 50, b: 60, classification: 2 },
    // 12 m to −X: inside camera A (u = 20), 22 m off camera B's axis (u = −5).
    { xM: -12, yM: 0, zM: 40, r: 70, g: 80, b: 90, classification: 2 },
  ];

  let outDir: string;

  beforeAll(async () => {
    const binPath = join(root, 'observed.bin');
    writeFileSync(binPath, packPoints(OBSERVED_POINTS));
    writeFileSync(join(root, 'cam_a.jpg'), 'jpeg-cam-a');
    writeFileSync(join(root, 'cam_b.jpg'), 'jpeg-cam-b');
    const camera = {
      rotation: [0, 0, 0, 1],
      focalLengthPx: 100,
      principalPointPx: [50, 40],
      imageWidthPx: 100,
      imageHeightPx: 80,
    } satisfies Omit<PhotoPose, 'id' | 'positionM' | 'imageUrl'>;

    outDir = join(root, 'observations');
    await writeColmapModel({
      poses: [
        { ...camera, id: 'cam_a', positionM: [0, 0, 0], imageUrl: join(root, 'cam_a.jpg') },
        { ...camera, id: 'cam_b', positionM: [10, 0, 0], imageUrl: join(root, 'cam_b.jpg') },
      ],
      pointsBinPath: binPath,
      pointSampleTarget: 10,
      outDir,
      observations: true,
    });
  });

  it('writes each image’s POINTS2D as u v point3d_id triples', () => {
    // Camera A is at the origin looking along +Z: u = 100·x/40 + 50, v = 100·y/40 + 40.
    // Camera B subtracts 10 from x first, and never sees the third point.
    expect(readFileSync(join(outDir, 'images.txt'), 'utf8')).toBe(
      '1 1 0 0 0 0 0 0 1 cam_a.jpg\n' +
        '60.00 40.00 1 70.00 60.00 2 20.00 40.00 -1\n' +
        '2 1 0 0 0 -10 0 0 2 cam_b.jpg\n' +
        '35.00 40.00 1 45.00 60.00 2\n',
    );
  });

  it('writes points3D.txt with a TRACK, dropping the single-view point', () => {
    // TRACK pairs are (image_id, that image's POINTS2D index), and the third
    // point — one view only — triangulates nothing, so it is not a point.
    expect(readFileSync(join(outDir, 'points3D.txt'), 'utf8')).toBe(
      '1 4 0 40 10 20 30 0.5 1 0 2 0\n' + '2 8 8 40 40 50 60 0.5 1 1 2 1\n',
    );
  });
});
