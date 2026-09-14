/**
 * requestDrifted — the drift edge's predicate.
 *
 * Requests come from the real `pointRow` derivation (`galaxyCatalogRequest`),
 * not a hand-written shape: the predicate is only as good as agreement with
 * what the rows actually ask for.
 */

import { describe, it, expect } from 'vitest';
import { requestDrifted } from '../../../../src/services/engine/wiring/requestDrifted';
import { galaxyCatalogRequest } from '../../../../src/services/engine/wiring/galaxyCatalogRequest';
import { Source } from '../../../../src/data/sources';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { Tier } from '../../../../src/@types/data/Tier';

/** `lastRequest` is the only slot surface the predicate reads. */
function slotAt(lastReq: unknown): AssetSlot<unknown, unknown> {
  return { lastRequest: () => lastReq } as unknown as AssetSlot<unknown, unknown>;
}

/** The SDSS point row — a source that ships per-tier variants, so its request names one. */
const sdssRow = {
  key: Source.SDSS,
  req: (tier: Tier) => galaxyCatalogRequest(Source.SDSS, tier),
} as unknown as AssetWiringRow;

describe('requestDrifted', () => {
  it('a null lastRequest is never drift', () => {
    // An idle or just-released slot has nothing to have drifted from. Reading
    // null as drift would fire the edge on every row that never loaded.
    expect(requestDrifted(slotAt(null), sdssRow, 'medium')).toBe(false);
  });

  it('an equal request is not drift', () => {
    // `req(tier)` allocates a fresh object per call, so this is the compare
    // being by value — identity would report drift every frame.
    expect(
      requestDrifted(slotAt(galaxyCatalogRequest(Source.SDSS, 'medium')), sdssRow, 'medium'),
    ).toBe(false);
  });

  it('a differing request is drift', () => {
    expect(
      requestDrifted(slotAt(galaxyCatalogRequest(Source.SDSS, 'small')), sdssRow, 'medium'),
    ).toBe(true);
  });
});
