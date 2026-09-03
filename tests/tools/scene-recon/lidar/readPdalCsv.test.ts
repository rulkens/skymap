/**
 * readPdalCsv — the fixture carries a non-integer Z and a saturated 255
 * colour value so a `parseInt`-style truncation or an off-by-one in the
 * colour range shows up as a wrong value rather than an inert pass.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readPdalCsv } from '../../../../tools/scene-recon/lidar/readPdalCsv';
import type { ScenePoint } from '../../../../tools/scene-recon/pack/packPoints';

const CSV = [
  'X,Y,Z,Red,Green,Blue,Classification',
  '10.5,20.25,100.125,255,0,17,2',
  '-5.0,0.0,-1.5,10,20,30,6',
  '0.0,0.0,0.0,0,0,0,0',
  '1000.75,-2000.5,3.333,128,64,32,18',
  '-0.001,42.42,-777.7,1,254,128,7',
].join('\n');

describe('readPdalCsv', () => {
  let dir: string;

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('yields one record per data row, skipping the header', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pdal-csv-'));
    const csvPath = join(dir, 'points.csv');
    writeFileSync(csvPath, CSV);

    const points: ScenePoint[] = [];
    for await (const point of readPdalCsv(csvPath)) {
      points.push(point);
    }

    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({
      xM: 10.5,
      yM: 20.25,
      zM: 100.125,
      r: 255,
      g: 0,
      b: 17,
      classification: 2,
    });
    expect(points[3]).toEqual({
      xM: 1000.75,
      yM: -2000.5,
      zM: 3.333,
      r: 128,
      g: 64,
      b: 32,
      classification: 18,
    });
  });
});
