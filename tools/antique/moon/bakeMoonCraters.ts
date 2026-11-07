#!/usr/bin/env node
/**
 * bakeMoonCraters — the antique Moon's crater table,
 * `src/data/rendering/antiqueMoonCraters.generated.ts`: every IAU crater and satellite
 * crater of MIN_DIAMETER_KM or more, its radius snapped to the LOLA rim crest and a
 * print weight from its depth (`craterPrintWeight`). The look's Moon pass picks the
 * ones it rings each frame (`pickMoonCraters`).
 *
 *   npm run bake-moon-craters
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { rawDataPath } from '../../utils/io/rawDataRegistry';
import { PROJECT_ROOT } from '../../utils/io/projectRoot';
import { craterPrintWeight } from './utils/craterPrintWeight';
import { fitCraterRim } from './utils/fitCraterRim';
import { readDbfRecords } from './utils/readDbfRecords';

/** Smaller craters never reach the rim size cut in the eight lookbench views but for
 *  a handful at its fade-in; 12 km keeps all but 1–3 faint rings per close-up. */
const MIN_DIAMETER_KM = 12;
/** Below this the rim's ink is nil (the shader ramps ink over weight 0.05..0.25). */
const MIN_WEIGHT = 0.05;
const MOON_RADIUS_KM = 1737.4;
const CRATER_TYPES = new Set(['Crater, craters', 'Satellite Feature']);
const OUT = 'src/data/rendering/antiqueMoonCraters.generated.ts';

async function main(): Promise<void> {
  const { data, info } = await sharp(rawDataPath('textures.moonElevation'), {
    limitInputPixels: false,
  })
    .toColourspace('grey16') // sharp's default output would be 8-bit sRGB
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`LOLA DEM: expected 1 channel, got ${info.channels}`);
  const halfMetres = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const dem = {
    width: info.width,
    height: info.height,
    data: Float32Array.from(halfMetres, (v) => v * 0.5),
  };

  const rows: [number, number, number, number][] = [];
  for (const r of readDbfRecords(readFileSync(rawDataPath('iau.moon-nomenclature')))) {
    const diameterKm = Number(r.diameter);
    if (!CRATER_TYPES.has(r.type!) || !(diameterKm >= MIN_DIAMETER_KM)) continue;
    const lat = Number(r.center_lat);
    const lon = ((Number(r.center_lon) + 540) % 360) - 180;
    const fit = fitCraterRim(dem, lat, lon, diameterKm, MOON_RADIUS_KM);
    const weight = craterPrintWeight(fit, diameterKm);
    if (weight > MIN_WEIGHT) rows.push([lat, lon, fit.rhoRad * MOON_RADIUS_KM, weight]);
  }
  rows.sort((a, b) => b[2] - a[2]);

  const body = rows
    .map(
      ([lat, lon, radius, weight]) =>
        `  ${lat.toFixed(2)}, ${lon.toFixed(2)}, ${radius.toFixed(1)}, ${weight.toFixed(2)},`,
    )
    .join('\n');
  writeFileSync(
    join(PROJECT_ROOT, OUT),
    `// ${OUT}\n` +
      '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
      '// Regenerate with:  npm run bake-moon-craters\n' +
      '// Source of truth:  the IAU gazetteer (USGS) and the LOLA DEM (NASA SVS)\n\n' +
      `/** ${rows.length} lunar craters, largest first, four numbers each: latitude and east\n` +
      ' *  longitude (deg), the LOLA rim-crest radius (km) and the print weight 0..1. */\n' +
      `export const ANTIQUE_MOON_CRATERS: readonly number[] = [\n${body}\n];\n`,
  );
  console.log(`${rows.length} craters → ${OUT}`);
}

await main();
