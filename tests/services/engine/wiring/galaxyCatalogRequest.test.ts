/**
 * The drift edge reloads a slot when its request stops matching the committed
 * one, so a request that names a tier the file does not carry is a per-flip
 * re-download of a byte-identical `.bin`. These tests derive both the request
 * and the filename from the registry — restating a per-source table here would
 * pin the caps, not the invariant between the two.
 */

import { describe, it, expect } from 'vitest';
import { galaxyCatalogRequest } from '../../../../src/services/engine/wiring/galaxyCatalogRequest';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';
import { tierFilenameForSource } from '../../../../src/data/tierTargets';
import { SOURCE_ENTRIES } from '../../../../src/data/sourceEntries';
import { Source } from '../../../../src/data/sources';
import { TIER_LADDER } from '../../../../src/data/tierLadder';
import type { SourceType } from '../../../../src/@types/data/SourceType';

const UNTIERED = [
  Source.TwoMRS,
  Source.FamousGalaxy,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];
const TIERED = [Source.SDSS, Source.Glade, Source.Milliquas];

/** Every galaxy catalog that actually ships a `.bin` — the only ones with a filename. */
const FILE_BACKED: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'galaxyCatalog' && e.binBaseName !== null,
).map((e) => e.code);

describe('galaxyCatalogRequest', () => {
  it("an untiered galaxy catalog's request names no tier", () => {
    for (const source of UNTIERED) {
      const req = galaxyCatalogRequest(source, 'medium');
      expect('tier' in req, `${source} named a tier it has no file for`).toBe(false);
      expect(
        sameRequest(galaxyCatalogRequest(source, 'small'), galaxyCatalogRequest(source, 'large')),
        `${source} drifted across tiers`,
      ).toBe(true);
    }
  });

  it("a tiered galaxy catalog's request carries its tier", () => {
    for (const source of TIERED) {
      for (const [a, b] of [
        ['small', 'medium'],
        ['medium', 'large'],
        ['small', 'large'],
      ] as const) {
        expect(
          sameRequest(galaxyCatalogRequest(source, a), galaxyCatalogRequest(source, b)),
          `${source} did not drift between ${a} and ${b}`,
        ).toBe(false);
      }
    }
  });

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
