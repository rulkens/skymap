#!/usr/bin/env node
/**
 * buildSatellites — data/raw/celestrak/<group>.json → public/data/<SATELLITE_CATALOG_PATH>. The
 * daily Action uploads that file to R2 as is. A catalog under `MIN_OBJECTS` throws instead of
 * writing: an upstream outage or a changed group list must fail the run, not publish a sky with
 * half its satellites (the app would show it for 14 days).
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';
import { PROJECT_ROOT } from '../utils/io/projectRoot';
import { writeSatelliteCatalog } from '../utils/io/writeSatelliteCatalog';
import { CELESTRAK_GROUPS } from './celestrakGroups';
import { buildSatelliteCatalog } from './buildSatelliteCatalog';
import { SATELLITE_CATALOG_PATH } from '../../src/data/satellites/satelliteCatalogPath';
import { SATELLITE_CLASSES } from '../../src/data/satellites/satelliteClasses';
import type { CelestrakOmm } from '../@types/satellites/CelestrakOmm';

// ~20k objects on 2026-10-28 (spec §5.1); a quarter less is an outage, not a quiet week.
const MIN_OBJECTS = 15_000;

function main(): void {
  const files = CELESTRAK_GROUPS.map((group) => ({
    group,
    path: join(rawDataPath('celestrak'), `${group.group}.json`),
  }));
  const downloads = files.map(({ group, path }) => ({
    group,
    records: JSON.parse(readFileSync(path, 'utf8')) as CelestrakOmm[],
  }));
  // The oldest download dates the whole catalog: the display window must not outlive any of it.
  const fetchedAtMs = Math.min(...files.map(({ path }) => statSync(path).mtimeMs));
  const { catalog, dropped } = buildSatelliteCatalog(downloads, fetchedAtMs);

  const n = catalog.noradId.length;
  if (n < MIN_OBJECTS) {
    throw new Error(`buildSatellites: only ${n} objects (floor ${MIN_OBJECTS}); not writing`);
  }
  const out = join(PROJECT_ROOT, 'public/data', SATELLITE_CATALOG_PATH);
  mkdirSync(dirname(out), { recursive: true });
  const bytes = writeSatelliteCatalog(catalog);
  writeFileSync(out, bytes);
  const perClass = SATELLITE_CLASSES.map(
    (cls, code) => `${cls} ${catalog.classCode.filter((c) => c === code).length}`,
  ).join(', ');
  console.log(
    `buildSatellites: ${n} objects (${perClass}; ${dropped} dropped) → ${out} (${(bytes.length / 1e6).toFixed(1)} MB)`,
  );
}

main();
