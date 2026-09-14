/**
 * Stable-request invariant: `sameRequest` compares `AssetWiringRow.req` values by
 * shallow equality, so a row whose `req(tier)` returns a freshly allocated nested
 * value reads as drifted on every frame — a per-frame reload storm. This holds
 * every real registry row to the shape the demand loop depends on, at every tier,
 * rather than trusting each row's author to remember.
 */

import { describe, it, expect } from 'vitest';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import { TIER_LADDER } from '../../../../src/data/tierLadder';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';

describe('ASSET_WIRING request shape', () => {
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
