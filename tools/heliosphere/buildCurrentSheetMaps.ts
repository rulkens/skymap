#!/usr/bin/env node
/**
 * buildCurrentSheetMaps — pack the fetched WSO charts into the heliospheric-current-sheet
 * spike's `hcs.js` (`window.HCS=[{cr, t, g}]`, loaded by render.html through a <script> tag).
 * Run `npm run fetch-wso` first. Values are rounded to 0.1 µT: the sheet is the B = 0
 * isosurface, so finer digits only bloat the file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseWsoRotationStarts } from '../parsers/parseWsoRotationStarts';
import { parseWsoSynopticChart } from '../parsers/parseWsoSynopticChart';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { fillRotationGrid } from './fillRotationGrid';
import type { CurrentSheetRotationMap } from './@types/CurrentSheetRotationMap';

const FIRST_ROTATION = 1642;
const LAST_ROTATION = 2302;
const LONGITUDE_COLUMNS = 72;
const OUTPUT_PATH = 'docs/research/heliospheric-current-sheet/hcs.js';

function readChart(model: 'R250' | 'S', cr: number): Map<number, number[]> {
  const path = join(rawDataPath('wso.synoptic'), `WSO-${model}.${cr}.txt`);
  return existsSync(path) ? parseWsoSynopticChart(readFileSync(path, 'utf8')) : new Map();
}

function main(): void {
  const starts = parseWsoRotationStarts(readFileSync(rawDataPath('wso.tilts'), 'utf8'));
  const maps: CurrentSheetRotationMap[] = [];
  const patched: string[] = [];
  let previous: readonly (readonly number[])[] | null = null;

  for (let cr = FIRST_ROTATION; cr <= LAST_ROTATION; cr++) {
    const t = starts.get(cr);
    if (t === undefined) throw new Error(`buildCurrentSheetMaps: no start date for CR ${cr}`);
    const radial = readChart('R250', cr);
    const classic =
      radial.size < LONGITUDE_COLUMNS ? readChart('S', cr) : new Map<number, number[]>();
    const filled = fillRotationGrid(radial, classic, previous);
    previous = filled.grid;
    if (filled.usedClassicModel) patched.push(`${cr} (S)`);
    if (filled.usedPreviousRotation) patched.push(`${cr} (previous rotation)`);
    maps.push({
      cr,
      t,
      g: filled.grid.map((column) => column.map((b) => Math.round(b * 10) / 10)),
    });
  }

  writeFileSync(OUTPUT_PATH, `window.HCS=${JSON.stringify(maps)};`);
  console.log(
    `buildCurrentSheetMaps: ${maps.length} rotations, patched: ${patched.join(', ')}; ` +
      `span ${maps[0]!.t} .. ${maps[maps.length - 1]!.t}`,
  );
}

main();
