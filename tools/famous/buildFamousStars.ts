#!/usr/bin/env node
/**
 * buildFamousStars — split the curated famous-stars seed into its two runtime
 * artefacts.
 *
 * Reads:
 *   - `data/seeds/famous_stars.seed.json`   (curated entries, single source of truth)
 *
 * Writes:
 *   - `src/data/bodies/famousStars.generated.ts`  (committed generated code)
 *   - `public/data/famous_stars_meta.json`        (gitignored build artefact)
 *
 * Why split at build time?  The seed carries everything a curator authors — sky
 * position, render primitives, physical properties, and multi-sentence prose.
 * The runtime wants those on two very different paths.  The render + search
 * projection (position, temperature, radius, names) must be present the instant
 * the engine initialises so a star is drawable and findable synchronously, with
 * no `createEngineData` async churn.  The narrative + physical properties (spectral
 * type, mass, age, ~100 KB of descriptions) belong off the hot path, fetched
 * lazily only when an InfoCard opens.  Emitting the two shapes at build time keeps
 * the seed legible (one file per star, all its facts together) while giving each
 * consumer exactly the fields it needs.
 *
 * Why a *committed* generated `.ts` for artefact (1) — the repo's first committed
 * codegen?  It lets init stay synchronous (ordinary `import`, no Vite JSON-import
 * config, no ArrayBuffer decode), it is validated by `tsc` on every typecheck via
 * the `readonly FamousStarRow[]` annotation, and — unlike a bundled JSON import —
 * it keeps the descriptions out of the JS bundle (those ride the sidecar instead).
 * The cost is a generated file living in `src/`; the top-of-file banner marks it
 * do-not-edit and the seed + table are always committed together, in sync.
 *
 * Artefact (2) is the same sidecar shape `buildFamous`/`buildStructures` emit,
 * written through the shared `writeMetaSidecar` helper — this is its third caller.
 *
 * The npm script is `build-famous-stars`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFamousStarsSeed, type FamousStarEntry } from '../parsers/famousStarsSeed';
import type { FamousStarRow } from '../../src/@types/data/FamousStarRow';
import type { FamousStarMetaEntry } from '../../src/@types/loading/FamousStarMetaEntry';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { writeMetaSidecar } from '../curation/writeMetaSidecar';

/**
 * Project the seed entries onto the compact render + search rows the runtime
 * table exports.  Everything derived (world position, linear RGB, radiusKm) is a
 * pure function of these primitives, computed later by the star maker, so the row
 * stays in the catalogue's own units.  `oblateness` is the sole optional key —
 * omitted entirely (never `null`/`0`) when the star is effectively spherical.
 */
export function seedToGeneratedRows(entries: readonly FamousStarEntry[]): FamousStarRow[] {
  return entries.map((e) => ({
    id: e.id,
    commonName: e.commonName,
    names: e.names,
    constellation: e.constellation,
    raDeg: e.ra,
    decDeg: e.dec,
    distancePc: e.distancePc,
    absMag: e.absMag,
    temperatureK: e.temperatureK,
    radiusSolar: e.radiusSolar,
    ...(e.oblateness !== undefined ? { oblateness: e.oblateness } : {}),
  }));
}

/**
 * Project the seed entries onto the InfoCard sidecar entries: the physical
 * properties + prose the card shows but the renderer never needs.  Optional
 * fields (`massSolar`/`luminositySolar`/`ageGyr`/`oblateness`/`variable`) are
 * omitted entirely when absent so the JSON never carries a `null`/`0` placeholder
 * a curator might mistake for a real measurement — the card simply drops the line.
 * Note `gaiaDr3`/`gaiaDr3Note` stay behind: they exist only for the Gaia dedup.
 */
export function seedToMetaEntries(entries: readonly FamousStarEntry[]): FamousStarMetaEntry[] {
  return entries.map((e) => ({
    id: e.id,
    names: e.names,
    constellation: e.constellation,
    spectralType: e.spectralType,
    distancePc: e.distancePc,
    magV: e.magV,
    absMag: e.absMag,
    radiusSolar: e.radiusSolar,
    temperatureK: e.temperatureK,
    ...(e.massSolar !== undefined ? { massSolar: e.massSolar } : {}),
    ...(e.luminositySolar !== undefined ? { luminositySolar: e.luminositySolar } : {}),
    ...(e.ageGyr !== undefined ? { ageGyr: e.ageGyr } : {}),
    ...(e.oblateness !== undefined ? { oblateness: e.oblateness } : {}),
    ...(e.variable !== undefined ? { variable: e.variable } : {}),
    description: e.description,
  }));
}

const GENERATED_BANNER =
  '// src/data/bodies/famousStars.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-famous-stars\n' +
  '// Source of truth:  data/seeds/famous_stars.seed.json\n';

/** Quote a string as a single-quoted TS literal (prettier's `singleQuote` style). */
function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Serialise one value as a prettier-stable TS literal (strings, numbers, string arrays). */
function literal(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => literal(v)).join(', ')}]`;
  // FamousStarRow carries only strings, numbers, and string arrays; anything
  // else means the row shape drifted and should fail loud rather than emit junk.
  throw new Error(`buildFamousStars: cannot serialise generated value ${JSON.stringify(value)}`);
}

/**
 * Emit the generated `.ts` module text.  Formatting targets prettier's repo
 * config (2-space indent, single quotes, trailing commas) so the committed file
 * survives a `prettier --write` unchanged.
 */
export function serializeGeneratedTable(rows: readonly FamousStarRow[]): string {
  const rowsText = rows
    .map((row) => {
      const fields = Object.entries(row)
        .map(([key, value]) => `    ${key}: ${literal(value)},`)
        .join('\n');
      return `  {\n${fields}\n  },`;
    })
    .join('\n');
  return (
    GENERATED_BANNER +
    "import type { FamousStarRow } from '../../@types/data/FamousStarRow';\n\n" +
    `export const FAMOUS_STARS_GENERATED: readonly FamousStarRow[] = [\n${rowsText}\n];\n`
  );
}

function main(): void {
  const seedPath = rawDataPath('famous-stars.seed');
  const entries = parseFamousStarsSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`loaded ${entries.length} famous star entries from seed\n`);

  const generatedPath = resolve('src/data/bodies/famousStars.generated.ts');
  writeFileSync(generatedPath, serializeGeneratedTable(seedToGeneratedRows(entries)));
  process.stderr.write(`wrote ${entries.length} rows to famousStars.generated.ts\n`);

  const metaPath = resolve('public/data/famous_stars_meta.json');
  writeMetaSidecar(seedToMetaEntries(entries), metaPath);
  process.stderr.write(`wrote famous_stars_meta.json\n`);
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err: unknown) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
