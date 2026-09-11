/**
 * Two ways this goes wrong, both silently: a field offset that lands on x, y
 * or the colour bytes (so the cloud's lowest z is nothing else's lowest), and
 * a floor taken as the minimum, which one DHM blunder drags kilometres down.
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
    // 1000 points of real terrain plus one blunder, so the 0.1% quantile
    // lands on the lowest ground point rather than on the blunder.
    packPoints([
      { xM: 0, yM: 0, zM: -413.5, r: 1, g: 2, b: 3, classification: 2 },
      ...Array.from({ length: 1000 }, (_unused, i) => ({
        xM: -90 - i,
        yM: -80 - i,
        zM: -7.25 + i * 0.03,
        r: 4,
        g: 5,
        b: 6,
        classification: 2,
      })),
    ]),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('lidarFloorZM', () => {
  it('takes the floor from the terrain, not from a blunder below it', async () => {
    const floorM = await lidarFloorZM(binPath);
    // Any terrain point passes: pinning the quantile's exact index would fail
    // on a retune of FLOOR_QUANTILE that is still obviously correct.
    expect(floorM).toBeGreaterThan(-50);
    expect(floorM).toBeLessThan(0);
  });
});
