/**
 * The floor is read straight out of packed bytes, so the only way it can be
 * wrong is a field offset that lands on x, y or the colour bytes — which a
 * cloud whose lowest z is not its lowest anything-else catches.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lidarFloorZM } from '../../../../tools/scene-recon/lidar/lidarFloorZM';
import { packPoints } from '../../../../tools/scene-recon/pack/packPoints';

let dir: string;
let binPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lidar-floor-'));
  binPath = join(dir, 'points.bin');
  writeFileSync(
    binPath,
    packPoints([
      { xM: -90, yM: -80, zM: 12.5, r: 1, g: 2, b: 3, classification: 2 },
      { xM: 40, yM: 30, zM: -7.25, r: 4, g: 5, b: 6, classification: 2 },
      { xM: 10, yM: 20, zM: 3, r: 7, g: 8, b: 9, classification: 2 },
    ]),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('lidarFloorZM', () => {
  it('returns the lowest z in the cloud', async () => {
    await expect(lidarFloorZM(binPath)).resolves.toBe(-7.25);
  });
});
