#!/usr/bin/env node
/**
 * bakeMoonFarSidePlaces — the antique Moon's far-side names,
 * `src/data/labels/antiqueMoonFarSidePlaces.generated.ts`: the IAU gazetteer's maria and
 * its craters of MIN_CRATER_KM or more on the hemisphere Riccioli never saw (centre
 * longitude beyond 90 deg east or west). Every one is a post-1959 name, which the plate
 * sets in roman against his italic. A mare keeps the gazetteer's own box.
 *
 *   npm run bake-moon-far-side-places
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { rawDataPath } from '../../utils/io/rawDataRegistry';
import { PROJECT_ROOT } from '../../utils/io/projectRoot';
import { readDbfRecords } from './utils/readDbfRecords';

/** About 30 craters: enough to fill a far-side disc the way the near side's 90 names do. */
const MIN_CRATER_KM = 180;
/** The ladder rank of the largest far-side crater; the rest step up by one per two names. */
const FIRST_CRATER_RANK = 20;
const OUT = 'src/data/labels/antiqueMoonFarSidePlaces.generated.ts';

const east = (lonDeg0to360: number): number => ((lonDeg0to360 + 540) % 360) - 180;
const r1 = (v: number): number => Math.round(v * 10) / 10;
// The gazetteer writes the apostrophe of "Mandel'shtam" and "d'Alembert" as a space.
const nameOf = (clean: string): string => clean.replace(/^(Mandel|d) (?=[sA])/, "$1'");
const idOf = (name: string): string =>
  `moonPlace-far-${name.replace(/[^A-Za-z]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase())}`;

const records = readDbfRecords(readFileSync(rawDataPath('iau.moon-nomenclature'))).filter(
  (r) => Math.abs(east(Number(r.center_lon))) >= 90,
);
const rows: string[] = [];

records
  .filter((r) => r.type === 'Mare, maria')
  .sort((a, b) => Number(b.diameter) - Number(a.diameter))
  .forEach((r, i) => {
    const name = nameOf(r.clean_name!).replace(' ', '\n');
    const lons = [Number(r.min_lon), Number(r.max_lon)].map(east);
    // A box straddling the antimeridian wraps; the gazetteer's own box is the extent.
    rows.push(
      `  { id: '${idOf(r.clean_name!)}', name: ${JSON.stringify(name)}, kind: 'mare', modern: true, rank: ${i + 1}, latDeg: ${r1(Number(r.center_lat))}, lonDeg: ${r1(east(Number(r.center_lon)))}, extentDeg: [${r1(Number(r.min_lat))}, ${r1(Number(r.max_lat))}, ${r1(Math.min(...lons))}, ${r1(Math.max(...lons))}] },`,
    );
  });

records
  .filter((r) => r.type === 'Crater, craters' && Number(r.diameter) >= MIN_CRATER_KM)
  .sort((a, b) => Number(b.diameter) - Number(a.diameter))
  .forEach((r, i) => {
    const name = nameOf(r.clean_name!);
    rows.push(
      `  { id: '${idOf(name)}', name: ${JSON.stringify(name)}, kind: 'crater', modern: true, rank: ${FIRST_CRATER_RANK + Math.floor(i / 2)}, latDeg: ${r1(Number(r.center_lat))}, lonDeg: ${r1(east(Number(r.center_lon)))}, diameterKm: ${r1(Number(r.diameter))} },`,
    );
  });

writeFileSync(
  join(PROJECT_ROOT, OUT),
  `// ${OUT}\n` +
    '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
    '// Regenerate with:  npm run bake-moon-far-side-places\n' +
    '// Source of truth:  IAU Gazetteer of Planetary Nomenclature (USGS), Moon centre points,\n' +
    '//                   public domain, data/raw/iau/README.md\n\n' +
    "import type { AntiqueMoonPlace } from '../../@types/rendering/AntiqueMoonPlace';\n\n" +
    '/** Far-side maria and craters, all post-1959 names (`ANTIQUE_MOON_PLACES` has the near side). */\n' +
    '// prettier-ignore\n' +
    `export const ANTIQUE_MOON_FAR_SIDE_PLACES: readonly AntiqueMoonPlace[] = [\n${rows.join('\n')}\n];\n`,
);
console.log(`${rows.length} far-side names → ${OUT}`);
