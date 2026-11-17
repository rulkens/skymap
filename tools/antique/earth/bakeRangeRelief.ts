#!/usr/bin/env node
/**
 * bakeRangeRelief (`npm run bake-range-relief`) — `public/antique/earth-range-relief.png`: the relief
 * over an 80 km window (`rangeRelief`, the measure the molehills gate on), as a grey equirectangular
 * map. Each pixel holds the highest value among the ETOPO z6 posts inside it, so a range is never
 * thinned; the relief pass's close-up hachures read it (`reliefFragment.wesl` `rangeGate`).
 * Grey = relief / RANGE_RELIEF_STEP_M, so 255 is 4,080 m.
 */

import { join } from 'node:path';

import sharp from 'sharp';

import { etopoHeightSource } from '../../textures/etopoHeightSource';
import { PROJECT_ROOT } from '../../utils/io/projectRoot';
import { heightLatticeStepDeg } from '../../utils/textures/heightLatticeStepDeg';
import type { HeightGrid } from './@types/HeightGrid';
import { RANGE_WINDOW_KM } from './data/rangeWindowKm';
import { rangeRelief } from './utils/rangeRelief';

const Z = 6;
const KM_PER_DEG = 111.195;
const PIXEL_DEG = 0.25;
const WIDTH = 360 / PIXEL_DEG;
const HEIGHT = 180 / PIXEL_DEG;
/** Metres per grey step: `RANGE_RELIEF_STEP_M` in `reliefFragment.wesl`. */
const RANGE_RELIEF_STEP_M = 16;
/** Posts per band read, as in `placeMolehills`. */
const BAND_POSTS = 8_000_000;
const OUT_PATH = join(PROJECT_ROOT, 'public/antique/earth-range-relief.png');

async function main(): Promise<void> {
  const source = await etopoHeightSource();
  const step = heightLatticeStepDeg(Z);
  const postsRound = Math.round(360 / step);
  const lastRow = postsRound / 2;
  const marginRows = Math.ceil(RANGE_WINDOW_KM / (step * KM_PER_DEG)) + 1;
  const bandRows = Math.floor(BAND_POSTS / postsRound);
  const grey = new Uint8Array(WIDTH * HEIGHT);

  for (let coreFrom = 0; coreFrom <= lastRow; coreFrom += bandRows) {
    const coreTo = Math.min(lastRow, coreFrom + bandRows - 1);
    const j0 = Math.max(0, coreFrom - marginRows);
    const ny = Math.min(lastRow, coreTo + marginRows) - j0 + 1;
    const h = await source.readGrid(Z, 0, j0, postsRound, ny);
    if (!h) continue;
    const grid: HeightGrid = { z: Z, i0: 0, j0, nx: postsRound, ny, wraps: true, h };
    const relief = rangeRelief(grid, RANGE_WINDOW_KM);
    for (let jj = coreFrom - j0; jj <= coreTo - j0; jj++) {
      const row = Math.min(HEIGHT - 1, Math.floor(((j0 + jj) * step) / PIXEL_DEG));
      for (let ii = 0; ii < postsRound; ii++) {
        const column = Math.min(WIDTH - 1, Math.floor((ii * step) / PIXEL_DEG));
        const value = Math.min(
          255,
          Math.round(relief[jj * postsRound + ii]! / RANGE_RELIEF_STEP_M),
        );
        const at = row * WIDTH + column;
        if (value > grey[at]!) grey[at] = value;
      }
    }
    console.log(`range relief: rows ${coreFrom}..${coreTo} of ${lastRow}`);
  }
  await sharp(grey, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(OUT_PATH);
  console.log(`wrote ${OUT_PATH}`);
}

await main();
