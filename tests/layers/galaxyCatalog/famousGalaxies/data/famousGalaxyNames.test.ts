/**
 * The compiled-in names table and the shipped meta sidecar are both indexed by `famous.bin`'s
 * record order. A table regenerated from an edited seed without a matching sidecar rebuild would
 * put one galaxy's name on another's card, so the two must agree row for row. Skips where no
 * sidecar is built (a fresh clone, CI without `public/data/`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FAMOUS_GALAXY_NAMES } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated';
import type { FamousGalaxyMetaEntry } from '../../../../../src/@types/loading/FamousGalaxyMetaEntry';

const DATA = resolve('public/data');
const MANIFEST = resolve(DATA, 'manifest.json');
const LOGICAL = 'famous_galaxies_meta.json';

/** The sidecar on disk: hashed through the manifest when one is built, else its plain name. */
function sidecarPath(): string {
  if (!existsSync(MANIFEST)) return resolve(DATA, LOGICAL);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string>;
  return resolve(DATA, manifest[LOGICAL] ?? LOGICAL);
}

const path = sidecarPath();

describe('FAMOUS_GALAXY_NAMES', () => {
  it.skipIf(!existsSync(path))('matches the meta sidecar row for row', () => {
    const meta = JSON.parse(readFileSync(path, 'utf8')) as FamousGalaxyMetaEntry[];
    const identity = ({ id, commonName, names }: FamousGalaxyMetaEntry) => ({
      id,
      ...(commonName !== undefined && { commonName }),
      names,
    });
    expect(FAMOUS_GALAXY_NAMES).toEqual(meta.map(identity));
  });
});
