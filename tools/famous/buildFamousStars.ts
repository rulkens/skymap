#!/usr/bin/env node
/**
 * buildFamousStars — split the curated `STAR_SEEDS` into runtime artefacts:
 *   1. a committed generated `.ts` table per seed (`generatedPath`): render + search
 *      fields, importable synchronously, kept out of the bundle's prose;
 *   2. `public/data/famous_stars_meta.json` (gitignored): physical properties and
 *      descriptions, fetched lazily when an InfoCard opens;
 *   3. `tools/stars-rs/src/famous_ids.generated.rs`: the Gaia/Hipparcos dedup ids
 *      (the Rust builder has no serde dependency, so it cannot parse the seed).
 * npm script: `build-famous-stars`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFamousStarsSeed,
  selectDedupEntries,
  selectHipEntries,
  type FamousStarEntry,
} from '../parsers/famousStarsSeed';
import type { FamousStarRow } from '../../src/@types/data/FamousStarRow';
import type { FamousStarMetaEntry } from '../../src/@types/loading/FamousStarMetaEntry';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { writeMetaSidecar } from '../curation/writeMetaSidecar';
import type { StarSeedArtefact } from './@types/StarSeedArtefact';

/**
 * The seed-backed star tables, one generated module each — a separate catalog
 * at runtime, which is what keeps "famous stars off" from also hiding the Sun.
 * The Rust dedup ids and the meta sidecar are built over all of them at once.
 */
export const STAR_SEEDS: readonly StarSeedArtefact[] = [
  {
    seedKey: 'famous-stars.seed',
    generatedPath: 'src/data/bodies/famousStars.generated.ts',
    exportName: 'FAMOUS_STARS_GENERATED',
  },
  {
    seedKey: 'sun.seed',
    generatedPath: 'src/data/bodies/sun.generated.ts',
    exportName: 'SUN_GENERATED',
  },
];

/**
 * Project the seed onto the compact render + search rows, in the catalogue's own
 * units. `oblateness` is the sole optional key: omitted (never `null`/`0`) when spherical.
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
    ...(e.orbit !== undefined ? { orbit: e.orbit } : {}),
  }));
}

/**
 * Project the seed onto the InfoCard sidecar entries. Optional fields are omitted when
 * absent so the JSON never carries a `null`/`0` that reads as a real measurement.
 * `gaiaDr3`/`gaiaDr3Note` stay behind: they exist only for the Gaia dedup.
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

function generatedBanner(seed: StarSeedArtefact): string {
  return (
    `// ${seed.generatedPath}\n` +
    '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
    '// Regenerate with:  npm run build-famous-stars\n' +
    `// Source of truth:  ${RAW_DATA[seed.seedKey].path}\n`
  );
}

/** Quote a string as a single-quoted TS literal (prettier's `singleQuote` style). */
function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Serialise one value as a prettier-stable TS literal (strings, numbers, string arrays). */
function literal(value: unknown, indent = '    '): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => literal(v)).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const inner = `${indent}  `;
    const fields = Object.entries(value).map(([key, v]) => `${inner}${key}: ${literal(v, inner)},`);
    return `{\n${fields.join('\n')}\n${indent}}`;
  }
  // FamousStarRow carries only strings, numbers, arrays and the orbit record; anything
  // else means the row shape drifted and should fail loud rather than emit junk.
  throw new Error(`buildFamousStars: cannot serialise generated value ${JSON.stringify(value)}`);
}

/** Emit the generated `.ts` text, formatted so `prettier --write` leaves it unchanged. */
export function serializeGeneratedTable(
  rows: readonly FamousStarRow[],
  seed: StarSeedArtefact,
): string {
  const rowsText = rows
    .map((row) => {
      const fields = Object.entries(row)
        .map(([key, value]) => `    ${key}: ${literal(value)},`)
        .join('\n');
      return `  {\n${fields}\n  },`;
    })
    .join('\n');
  return (
    generatedBanner(seed) +
    "import type { FamousStarRow } from '../../@types/data/FamousStarRow';\n\n" +
    `export const ${seed.exportName}: readonly FamousStarRow[] = [\n${rowsText}\n];\n`
  );
}

const RUST_GENERATED_BANNER =
  '// tools/stars-rs/src/famous_ids.generated.rs\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-famous-stars\n' +
  '// Source of truth:  data/seeds/famous_stars.seed.json\n' +
  '//\n' +
  '// Two dedup key arrays derived from every seed entry, subtracted from the\n' +
  '// native star bin so a catalogued star never doubles a scene body:\n' +
  '//   FAMOUS_STAR_GAIA_IDS — the non-null gaiaDr3 values (Gaia DR3 source_ids).\n' +
  '//   FAMOUS_STAR_HIP_IDS  — the non-null hip values (Hipparcos numbers), which\n' +
  '//     catch the saturated bright stars Gaia DR3 lacks a row for.\n' +
  "// include!()-d into population.rs so the consts land in that module's\n" +
  '// namespace, exactly where the hand-maintained array used to live.\n';

/**
 * Emit the `.rs` text: a `[u64; N]` of non-null `gaiaDr3` ids then a `[u32; M]` of
 * `hip` ids, in seed order, tagged with the star id. Which entries contribute lives in
 * `selectDedupEntries` / `selectHipEntries`; this owns only the Rust-text encoding.
 */
export function seedToRustConst(entries: readonly FamousStarEntry[]): string {
  const gaiaMatched = selectDedupEntries(entries);
  const gaiaRows = gaiaMatched.map((e) => `    ${e.gaiaDr3}, // ${e.id}`).join('\n');
  const hipMatched = selectHipEntries(entries);
  const hipLines = hipMatched.map((e) => `    ${e.hip}, // ${e.id}`);
  const hipRows = hipLines.join('\n');
  return (
    RUST_GENERATED_BANNER +
    `pub const FAMOUS_STAR_GAIA_IDS: [u64; ${gaiaMatched.length}] = [\n${gaiaRows}\n];\n` +
    `pub const FAMOUS_STAR_HIP_IDS: [u32; ${hipLines.length}] = [\n${hipRows}\n];\n`
  );
}

function main(): void {
  const allEntries: FamousStarEntry[] = [];

  for (const seed of STAR_SEEDS) {
    const entries = parseFamousStarsSeed(readFileSync(rawDataPath(seed.seedKey), 'utf8'));
    allEntries.push(...entries);
    writeFileSync(
      resolve(seed.generatedPath),
      serializeGeneratedTable(seedToGeneratedRows(entries), seed),
    );
    process.stderr.write(`wrote ${entries.length} rows to ${seed.generatedPath}\n`);
  }

  const rustPath = resolve('tools/stars-rs/src/famous_ids.generated.rs');
  writeFileSync(rustPath, seedToRustConst(allEntries));
  process.stderr.write(`wrote famous_ids.generated.rs\n`);

  const metaPath = resolve('public/data/famous_stars_meta.json');
  writeMetaSidecar(seedToMetaEntries(allEntries), metaPath);
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
