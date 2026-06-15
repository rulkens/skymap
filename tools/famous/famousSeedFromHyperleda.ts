#!/usr/bin/env node
/**
 * famousSeedFromHyperleda — print a paste-ready `famous_galaxies.seed.json`
 * entry for one or more galaxies, derived from HyperLEDA.
 *
 * The `/add-famous` skill needs hand-authored seed entries for galaxies that
 * aren't in the Messier or Caldwell tables (e.g. the NGC 3166/3169 pair).
 * Doing that by hand means transcribing HyperLEDA parameters and applying a
 * handful of conversion formulas — easy to get subtly wrong (aperture vs.
 * total magnitudes, modz vs. mod0 distance, logd25 → kpc).  This script does
 * it mechanically.
 *
 * It is a thin CLI shell around code that already exists and is already
 * tested:
 *
 *   - `hyperLedaMeandataUrl` + `parseHyperLedaMeandata` fetch and parse the
 *     same `meandata` endpoint `expand-famous` uses.  That endpoint lives on
 *     the plain-HTTP `atlas.obs-hp.fr` mirror, so a Node `fetch` reaches it
 *     directly — the expired-TLS-cert wall only bites browser/WebFetch paths
 *     that upgrade `leda.univ-lyon1.fr` to HTTPS.
 *   - `mergeIntoFamousEntry` applies the canonical field formulas (distance
 *     mod0 → v3k, diameter from logd25, axis ratio from logr25, the
 *     magnitude-error > 0.5 rejection rule).  Reusing it — rather than
 *     re-deriving the maths here — guarantees the script and the real
 *     pipeline can never drift.
 *   - `orderEntryFields` emits fields in the schema order so the printout
 *     drops straight into the seed array with no reordering.
 *
 * The only thing the script can't supply is `description`: that's curated
 * prose from the galaxy's Wikipedia lead, so it's left empty for the human
 * to fill before committing.
 *
 * Usage:
 *   npm run famous-seed-from-leda -- NGC3166 NGC3169
 *   npm run famous-seed-from-leda -- "NGC 5128"
 */

import { fileURLToPath } from 'node:url';

import {
  hyperLedaMeandataUrl,
  parseHyperLedaMeandata,
  type HyperLedaMeandataRow,
} from '../parsers/hyperledaMeandata';
import { mergeIntoFamousEntry, orderEntryFields, ngcDisplayName } from './expandFamousFromCatalogs';

/**
 * Build a canonically-ordered seed entry object from a parsed HyperLEDA row.
 * Returns `null` when the row lacks the data `mergeIntoFamousEntry` needs
 * (no usable distance or diameter) — the caller reports the skip.
 *
 * `queryName` is the user-supplied identifier (e.g. `NGC3166` or
 * `NGC 3169`); we normalise it through `ngcDisplayName` to get the spaced
 * display form (`NGC 3166`) for `names[0]`, and lower-case + de-space it for
 * the filesystem-safe `id` (`ngc3166`).  `description` is deliberately left
 * empty — it's human-curated Wikipedia prose.
 */
export function seedEntryFromMeandata(
  queryName: string,
  row: HyperLedaMeandataRow,
): Record<string, unknown> | null {
  const display = ngcDisplayName(queryName.replace(/\s+/g, ''));
  const id = display.toLowerCase().replace(/\s+/g, '');
  const entry = mergeIntoFamousEntry({
    defaultId: id,
    defaultNames: [display],
    row,
    existing: undefined,
    wikipediaDescription: '',
  });
  if (entry === null) return null;
  return orderEntryFields(entry);
}

async function main(): Promise<void> {
  const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (names.length === 0) {
    process.stderr.write('usage: famous-seed-from-leda <NGC3166> [NGC3169 ...]\n');
    process.exit(1);
  }

  const entries: Record<string, unknown>[] = [];
  for (const name of names) {
    const res = await fetch(hyperLedaMeandataUrl(name));
    if (!res.ok) {
      process.stderr.write(`  ${name}: HyperLEDA HTTP ${res.status}\n`);
      continue;
    }
    const row = parseHyperLedaMeandata(await res.text());
    if (row === null) {
      process.stderr.write(`  ${name}: no HyperLEDA match\n`);
      continue;
    }
    if (row.objtype.trim() !== 'G') {
      process.stderr.write(`  ${name}: not a galaxy (objtype="${row.objtype}")\n`);
      continue;
    }
    const entry = seedEntryFromMeandata(name, row);
    if (entry === null) {
      process.stderr.write(`  ${name}: no usable distance/diameter — skipped\n`);
      continue;
    }
    entries.push(entry);
    process.stderr.write(`  ${name}: ok → id "${entry.id as string}"\n`);
  }

  // Print the entries as a JSON array fragment.  The empty `description`
  // strings are the human's to-do list before committing.
  process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
  process.stderr.write(`\nFill each empty "description" from the galaxy's Wikipedia lead.\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
