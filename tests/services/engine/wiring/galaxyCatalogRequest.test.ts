/**
 * The drift edge reloads a slot when the row's request stops matching the
 * slot's last request, so a request that names a tier the file does not carry
 * is a per-flip re-download of a byte-identical `.bin`. This test derives both
 * the request and the filename from the registry — restating a per-source table
 * here would pin the caps, not the invariant between the two.
 */

import { describe, it, expect } from 'vitest';
import { galaxyCatalogRequest } from '../../../../src/services/engine/wiring/galaxyCatalogRequest';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';
import { tierFilenameForSource } from '../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { TIER_LADDER } from '../../../../src/data/tierLadder';
import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/** Every galaxy catalog that actually ships a `.bin` — the only ones with a filename. */
const FILE_BACKED: readonly GalaxyCatalogId[] = GALAXY_CATALOG_SOURCE_ROWS.filter(
  (e) => e.binBaseName !== null,
).map((e) => e.id);

describe('galaxyCatalogRequest', () => {
  it('the request agrees with the filename', () => {
    for (const source of FILE_BACKED) {
      for (const a of TIER_LADDER) {
        for (const b of TIER_LADDER) {
          expect(
            sameRequest(galaxyCatalogRequest(source, a), galaxyCatalogRequest(source, b)),
            `${source}: request sameness at ${a} vs ${b} disagrees with the filename`,
          ).toBe(tierFilenameForSource(source, a) === tierFilenameForSource(source, b));
        }
      }
    }
  });
});
