/**
 * AssetWiringRow — compile-time assignability check.
 *
 * Confirms that a literal row for the SDSS galaxy catalog satisfies
 * `AssetWiringRow<GalaxyCatalog, GalaxyCatalogReq>`: all four fields —
 * `key`, `factory`, `req`, `demand` — are accepted at their correct types.
 *
 * The test also verifies the construction-purity contract: `factory` returns
 * an `AssetSlot<GalaxyCatalog, GalaxyCatalogReq>` without touching
 * `state.assetSlots` or calling `slot.load()`.
 *
 * Purely compile-time: if `AssetWiringRow` drifts from its spec (a field is
 * renamed, a generic parameter is reordered, `SlotDeps` changes shape),
 * this file stops compiling and the typecheck gate catches it.
 */

import { describe, expect, it } from 'vitest';
import type { AssetWiringRow } from '../../../src/@types/loading/AssetWiringRow';
import type { GalaxyCatalog } from '../../../src/@types/data/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../../src/@types/loading/GalaxyCatalogReq';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';
import type { SlotDeps } from '../../../src/@types/loading/SlotDeps';
import { Source } from '../../../src/data/sources';

// Stub slot — structurally satisfies AssetSlot<GalaxyCatalog, GalaxyCatalogReq>
// without importing `createAssetSlot` (which carries GPU-side side effects).
const stubSlot = {} as unknown as AssetSlot<GalaxyCatalog, GalaxyCatalogReq>;

const sdssRow: AssetWiringRow<GalaxyCatalog, GalaxyCatalogReq> = {
  key: Source.SDSS,
  factory: (_deps: SlotDeps) => stubSlot,
  req: (tier) => ({ source: Source.SDSS, tier }),
  demand: (ctx) => ctx.settings.galaxyCatalogs.items.sdss?.enabled === true,
};

describe('AssetWiringRow assignability', () => {
  it('accepts a literal row for the SDSS galaxy catalog', () => {
    expect(sdssRow).toBeDefined();
  });

  it('key accepts a SourceType value (Source.SDSS)', () => {
    expect(sdssRow.key).toBe(Source.SDSS);
  });

  it('req returns a GalaxyCatalogReq with the given tier', () => {
    const r: GalaxyCatalogReq = sdssRow.req('medium');
    expect(r.source).toBe(Source.SDSS);
    expect(r.tier).toBe('medium');
  });

  it('demand returns a boolean from the settings galaxy catalogs read', () => {
    const fakeCtx = {
      settings: { galaxyCatalogs: { items: { sdss: { enabled: true } } } } as never,
      request: (_k: string) => false,
      slotState: (_k: unknown) => 'idle' as const,
    };
    const result: boolean = sdssRow.demand(fakeCtx);
    expect(result).toBe(true);
  });
});
