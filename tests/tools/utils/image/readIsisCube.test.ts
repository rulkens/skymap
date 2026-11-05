import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readIsisCube } from '../../../../tools/utils/image/readIsisCube';

const NULL_PIXEL = -3.4028226550889045e38;
const R = 1000;

/** A 5x3 cube in 2x2 tiles (so the right and bottom tiles overhang), value = 10*row + col. */
function writeCube(over: Record<string, string> = {}): string {
  const W = 5;
  const H = 3;
  const label = (k: string, v: string) => `${k} = ${over[k] ?? v}\n`;
  const text =
    'Object = IsisCube\n  Object = Core\n' +
    label('StartByte', '513') +
    label('Format', 'Tile') +
    'TileSamples = 2\nTileLines = 2\n' +
    `Samples = ${W}\nLines = ${H}\n` +
    label('Bands', '1') +
    label('Type', 'Real') +
    label('ByteOrder', 'Lsb') +
    label('ProjectionName', 'SimpleCylindrical') +
    label('LongitudeDirection', 'PositiveEast') +
    'CenterLongitude = 180.0\n' +
    `EquatorialRadius = ${R} <meters>\n` +
    `UpperLeftCornerX = ${-Math.PI * R} <meters>\n` +
    `UpperLeftCornerY = ${(Math.PI * R) / 2} <meters>\n` +
    `PixelResolution = ${(2 * Math.PI * R) / W} <meters/pixel>\n`;
  const file = Buffer.alloc(512 + 3 * 3 * 4 * 4);
  file.write(text, 0, 'latin1');
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 3; tx++) {
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const row = ty * 2 + r;
          const col = tx * 2 + c;
          const v = row === 1 && col === 3 ? NULL_PIXEL : 10 * row + col;
          file.writeFloatLE(v, 512 + (((ty * 3 + tx) * 2 + r) * 2 + c) * 4);
        }
      }
    }
  }
  const path = join(mkdtempSync(join(tmpdir(), 'cube-')), 'a.cub');
  writeFileSync(path, file);
  return path;
}

describe('readIsisCube', () => {
  it('reassembles tiles, drops the overhang, maps special pixels to NaN', () => {
    const cube = readIsisCube(writeCube());
    expect([cube.width, cube.height]).toEqual([5, 3]);
    expect(cube.data[0 * 5 + 4]).toBe(4); // right edge tile
    expect(cube.data[2 * 5 + 1]).toBe(21); // bottom edge tile
    expect(cube.data[1 * 5 + 3]).toBeNaN();
  });

  it('derives the left-edge longitude from the label, not the filename', () => {
    expect(readIsisCube(writeCube()).leftLonDeg).toBeCloseTo(0);
  });

  it('reports the top-edge latitude and degrees per pixel from the label', () => {
    const cube = readIsisCube(writeCube());
    expect(cube.topLatDeg).toBeCloseTo(90);
    expect(cube.degPerPixel).toBeCloseTo(72); // 5 columns span 360 degrees
  });

  it('throws on a layout it does not support', () => {
    expect(() => readIsisCube(writeCube({ ByteOrder: 'Msb' }))).toThrow(/ByteOrder/);
  });
});
