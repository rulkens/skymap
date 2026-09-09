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

async function collect(csvPath: string): Promise<ScenePoint[]> {
  const points: ScenePoint[] = [];
  for await (const point of readPdalCsv(csvPath)) {
    points.push(point);
  }
  return points;
}

describe('readPdalCsv', () => {
  let dir: string;

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('yields one record per data row, skipping the header', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pdal-csv-'));
    const csvPath = join(dir, 'points.csv');
    writeFileSync(csvPath, CSV);

    const points = await collect(csvPath);

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

  it('throws on a row with an empty field and on a header that does not match the writer order', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pdal-csv-bad-'));

    // Blue is empty — a truncated write, not a legitimate zero (that's "0").
    const malformedRowPath = join(dir, 'malformed-row.csv');
    writeFileSync(
      malformedRowPath,
      ['X,Y,Z,Red,Green,Blue,Classification', '10.5,20.25,100.125,255,0,,2'].join('\n'),
    );
    await expect(collect(malformedRowPath)).rejects.toThrow(/line 2.*Blue/);

    const badHeaderPath = join(dir, 'bad-header.csv');
    writeFileSync(badHeaderPath, ['X,Y,Z,R,G,B,C', '10.5,20.25,100.125,255,0,17,2'].join('\n'));
    await expect(collect(badHeaderPath)).rejects.toThrow(/header/i);
  });
});
