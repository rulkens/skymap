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
import { tierFilenameForSource } from '../../../../src/data/tierTargets';
import { SOURCE_ENTRIES } from '../../../../src/data/sourceEntries';
import { TIER_LADDER } from '../../../../src/data/tierLadder';
import type { SourceType } from '../../../../src/@types/data/SourceType';

/** Every galaxy catalog that actually ships a `.bin` — the only ones with a filename. */
const FILE_BACKED: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'galaxyCatalog' && e.binBaseName !== null,
).map((e) => e.code);

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
