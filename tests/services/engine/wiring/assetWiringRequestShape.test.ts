/**
 * Flat-request invariant: `sameRequest` compares `AssetWiringRow.req` values by
 * shallow equality, so a nested object value would compare unequal across the
 * separate allocations `req(tier)` makes every call — a per-frame reload storm.
 * These tests hold every real registry row to the flat shape the demand loop
 * depends on, at every tier, rather than trusting each row's author to remember.
 */

import { describe, it, expect } from 'vitest';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import { TIER_LADDER } from '../../../../src/data/tierLadder';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';

function isFlatPrimitiveRecord(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
}

describe('ASSET_WIRING request shape', () => {
  it("every row's req is undefined or a flat record of primitives, at every tier", () => {
    for (const row of ASSET_WIRING) {
      for (const tier of TIER_LADDER) {
        const req = row.req(tier);
        expect(
          isFlatPrimitiveRecord(req),
          `row '${String(row.key)}' at tier '${tier}' returned a non-flat req: ${JSON.stringify(req)}`,
        ).toBe(true);
      }
    }
  });

  it("every row's req is stable across two calls at the same tier", () => {
    for (const row of ASSET_WIRING) {
      for (const tier of TIER_LADDER) {
        const a = row.req(tier);
        const b = row.req(tier);
        expect(
          sameRequest(a, b),
          `row '${String(row.key)}' at tier '${tier}' produced an unstable req across two calls`,
        ).toBe(true);
      }
    }
  });
});
