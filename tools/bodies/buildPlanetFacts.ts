#!/usr/bin/env node
/**
 * buildPlanetFacts — compile the curated planet/moon fact seed into the
 * committed generated `BODY_FACTS` table the InfoCard renders.
 *
 * Reads:
 *   - `data/seeds/planet_facts.seed.json`   (curated entries, single source of truth)
 *
 * Writes:
 *   - `src/data/bodies/bodyFacts.generated.ts`  (committed generated code)
 *
 * Why store the values as pre-formatted display *strings* rather than raw
 * numbers?  Each body picks the unit that reads best — Earth masses for
 * planets, kilograms for a moon a billion times lighter, '243 Earth days
 * (retrograde)' where a bare number would mislead — so baking the unit +
 * friendly rounding into the datum keeps the card a dumb renderer.
 *
 * Why compiled-in generated code rather than a runtime fetch (as the
 * famous-star meta uses)?  The Solar System is a tiny fixed set whose masses
 * and orbits don't change between builds, so a fetch would be pure overhead.
 * The generated `.ts` is committed and imported synchronously; `tsc` validates
 * it on every typecheck via the `Record<string, BodyFacts>` annotation.
 *
 * Conventions the seed encodes: `parent` present ⇒ the body is a moon (the
 * card relabels its distance/period rows to speak of the parent planet), and
 * `wikiTitle` is stated explicitly per body because the article-title mapping
 * is irregular ('Mercury_(planet)' vs plain 'Venus').
 *
 * The npm script is `build-planet-facts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { parsePlanetFactsSeed, type PlanetFactsEntry } from '../parsers/planetFactsSeed';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const GENERATED_BANNER =
  '// src/data/bodies/bodyFacts.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-planet-facts\n' +
  '// Source of truth:  data/seeds/planet_facts.seed.json\n';

/** Quote a string as a single-quoted TS literal; the final prettier pass in
 * `main` normalises quote style and long-string wrapping. */
function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Emit the generated `.ts` module text: the `BODY_FACTS` record rebuilt from
 * the seed array, each entry keyed by its `id` with the remaining fields as its
 * `BodyFacts` value.  Field order follows the seed's own key order so the file
 * is deterministic.  The output is near-prettier; `main` runs it through
 * prettier before writing (Record keys and long `description` blurbs need the
 * real formatter for quote style + line wrapping), so the committed file is
 * canonical and a rebuild produces no diff.
 */
export function serializeGeneratedTable(entries: readonly PlanetFactsEntry[]): string {
  const rowsText = entries
    .map(({ id, ...facts }) => {
      const fields = Object.entries(facts)
        .map(([key, value]) => `    ${key}: ${quote(value as string)},`)
        .join('\n');
      return `  ${quote(id)}: {\n${fields}\n  },`;
    })
    .join('\n');
  return (
    GENERATED_BANNER +
    "import type { BodyFacts } from '../../@types/scene/BodyFacts';\n\n" +
    `export const BODY_FACTS: Readonly<Record<string, BodyFacts>> = {\n${rowsText}\n};\n`
  );
}

async function main(): Promise<void> {
  const seedPath = rawDataPath('planet-facts.seed');
  const entries = parsePlanetFactsSeed(JSON.parse(readFileSync(seedPath, 'utf8')));
  process.stderr.write(`loaded ${entries.length} planet-fact entries from seed\n`);

  const generatedPath = resolve('src/data/bodies/bodyFacts.generated.ts');
  const prettierConfig = await resolveConfig(generatedPath);
  const formatted = await format(serializeGeneratedTable(entries), {
    ...prettierConfig,
    parser: 'typescript',
  });
  writeFileSync(generatedPath, formatted);
  process.stderr.write(`wrote ${entries.length} rows to bodyFacts.generated.ts\n`);
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
