#!/usr/bin/env node
/**
 * buildAntiqueEarth — bakes the antique atlas look's Earth map,
 * `public/antique/earth-1690.bin` (`antiqueEarthMapFormat.ts`), from its
 * sources: each returns a piece (fill, strips, signs) and the pieces are
 * concatenated in SOURCES order, which is also the signs' painter order.
 * Needs `npm run fetch-natural-earth` and ETOPO (`npm run fetch-height`).
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AntiqueMapPiece } from './@types/AntiqueMapPiece';
import type { HeightSource } from '../../textures/@types/HeightSource';
import { etopoHeightSource } from '../../textures/etopoHeightSource';
import { PROJECT_ROOT } from '../../utils/io/projectRoot';
import { writeFileAtomic } from '../../utils/io/writeFileAtomic';
import {
  ANTIQUE_EARTH_MAP_FILE,
  ANTIQUE_EARTH_MAP_HEADER_BYTES,
  ANTIQUE_FILL_VERTEX_BYTES,
  ANTIQUE_LINE_VERTEX_BYTES,
  ANTIQUE_MAP_LEVELS,
  ANTIQUE_SIGN_BYTES,
} from '../../../src/layers/body/earth/antiqueMap/data/antiqueEarthMapFormat';
import { concatAntiqueMapPieces } from './utils/concatAntiqueMapPieces';
import { encodeAntiqueEarthMap } from './utils/encodeAntiqueEarthMap';
import { molehillsSource } from './sources/molehillsSource';
import { riversSource } from './sources/riversSource';

const OUT_PATH = join(PROJECT_ROOT, 'public/antique', ANTIQUE_EARTH_MAP_FILE);

const SOURCES: readonly ((heights: HeightSource) => Promise<AntiqueMapPiece>)[] = [
  // Plug-in point: realm fills and realm/province borders (line kinds 0, 1).
  riversSource,
  molehillsSource,
  // Plug-in point: towns (sign kinds 0–7), last so they paint over the hills.
];

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
const perLevel = (levels: readonly number[]) =>
  Array.from(
    { length: ANTIQUE_MAP_LEVELS },
    (_, level) => levels.filter((l) => l === level).length,
  ).join(' / ');

async function main(): Promise<void> {
  const heights = await etopoHeightSource();
  const pieces: AntiqueMapPiece[] = [];
  for (const source of SOURCES) pieces.push(await source(heights));
  const map = concatAntiqueMapPieces(pieces);
  const bytes = encodeAntiqueEarthMap(map);

  const lineVertices = map.strips.reduce((n, strip) => n + strip.points.length, 0);
  const vertexLevels = map.strips.flatMap((strip) => strip.points.map(() => strip.level));
  console.log(`header         ${kb(ANTIQUE_EARTH_MAP_HEADER_BYTES)}`);
  console.log(
    `fill vertices  ${map.fill.codes.length}, ${kb(map.fill.codes.length * ANTIQUE_FILL_VERTEX_BYTES)}`,
  );
  console.log(`fill indices   ${map.fill.indices.length}, ${kb(map.fill.indices.length * 4)}`);
  console.log(
    `line strips    ${map.strips.length} (per level ${perLevel(map.strips.map((s) => s.level))})`,
  );
  console.log(
    `line vertices  ${lineVertices}, ${kb(lineVertices * ANTIQUE_LINE_VERTEX_BYTES)} (per level ${perLevel(vertexLevels)})`,
  );
  console.log(
    `signs          ${map.signs.length}, ${kb(map.signs.length * ANTIQUE_SIGN_BYTES)} (per level ${perLevel(map.signs.map((s) => s.level))})`,
  );
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileAtomic(OUT_PATH, bytes);
  console.log(`wrote ${OUT_PATH}, ${kb(bytes.length)}`);
}

await main();
