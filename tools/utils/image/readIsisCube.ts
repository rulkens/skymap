/**
 * readIsisCube — decode a tiled, Real, LSB, one-band SimpleCylindrical ISIS3
 * cube (the Schenk Uranian-satellite maps) and throw on anything else.
 *
 * Tiles are row-major and edge tiles are stored full-size, so the file is larger
 * than width*height. Every ISIS special pixel (NULL, LRS, LIS, HIS, HRS) is a
 * float at or below -3.4e38, which is how they are told apart from data.
 * The left edge's longitude comes from x = R*(lon - CenterLongitude): the
 * Miranda DEM starts at lon 0 while its mosaic starts at -180. The top latitude
 * and pixel scale come from the label too, because a regional cube (Triton) is
 * not a full globe.
 */

import { readFileSync } from 'node:fs';

import type { IsisCubeRaster } from '../../@types/image/IsisCubeRaster';

const SPECIAL_PIXEL_BELOW = -3.4e38;
const LABEL_SCAN_BYTES = 65536;
const BYTES_PER_SAMPLE = 4;

export function readIsisCube(path: string): IsisCubeRaster {
  const file = readFileSync(path);
  const label = file.toString('latin1', 0, Math.min(file.length, LABEL_SCAN_BYTES));
  const text = (key: string): string => {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, 'm').exec(label);
    if (m === null) throw new Error(`readIsisCube: ${path} has no ${key}`);
    return m[1]!;
  };
  for (const [key, want] of [
    ['Format', 'Tile'],
    ['Type', 'Real'],
    ['ByteOrder', 'Lsb'],
    ['Bands', '1'],
    ['ProjectionName', 'SimpleCylindrical'],
    ['LongitudeDirection', 'PositiveEast'],
  ] as const) {
    if (text(key) !== want)
      throw new Error(`readIsisCube: ${path}: ${key} ${text(key)} != ${want}`);
  }

  const width = Number(text('Samples'));
  const height = Number(text('Lines'));
  const tileW = Number(text('TileSamples'));
  const tileH = Number(text('TileLines'));
  const start = Number(text('StartByte')) - 1;
  const tilesAcross = Math.ceil(width / tileW);
  const tilesDown = Math.ceil(height / tileH);
  if (file.length < start + tilesAcross * tilesDown * tileW * tileH * BYTES_PER_SAMPLE) {
    throw new Error(`readIsisCube: ${path} is truncated`);
  }

  const data = new Float32Array(width * height);
  const view = new DataView(file.buffer, file.byteOffset, file.length);
  for (let ty = 0; ty < tilesDown; ty++) {
    for (let tx = 0; tx < tilesAcross; tx++) {
      const tileStart = start + (ty * tilesAcross + tx) * tileW * tileH * BYTES_PER_SAMPLE;
      for (let r = 0; r < tileH && ty * tileH + r < height; r++) {
        for (let c = 0; c < tileW && tx * tileW + c < width; c++) {
          const v = view.getFloat32(tileStart + (r * tileW + c) * BYTES_PER_SAMPLE, true);
          data[(ty * tileH + r) * width + tx * tileW + c] = v < SPECIAL_PIXEL_BELOW ? NaN : v;
        }
      }
    }
  }

  const radius = Number(text('EquatorialRadius'));
  const leftLonDeg =
    Number(text('CenterLongitude')) + ((Number(text('UpperLeftCornerX')) / radius) * 180) / Math.PI;
  const topLatDeg = ((Number(text('UpperLeftCornerY')) / radius) * 180) / Math.PI;
  const degPerPixel = ((Number(text('PixelResolution')) / radius) * 180) / Math.PI;
  return { data, width, height, leftLonDeg, topLatDeg, degPerPixel, equatorialRadiusM: radius };
}
