/**
 * buildSlotsFromRegistry — unit tests for the construction pass.
 *
 * The builder is the pure half of the build → install → load pipeline: it
 * calls each non-external row's `factory(deps)` and collects the returned
 * slots, writing nothing to state and never loading. Three invariants:
 *
 *   - one slot per non-external row, keyed by `row.key`;
 *   - `built: 'external'` rows are skipped (their throwing factory is never
 *     called) — the contract that keeps point slots minted only in initGpu;
 *   - no state mutation and no `.load()` (purity).
 *
 * Stub rows keep the loop logic isolated from the real ASSET_WIRING registry,
 * mirroring the stub-row style in reevaluateDemand.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildSlotsFromRegistry } from '../../../../src/services/engine/wiring/buildSlotsFromRegistry';
import { Source } from '../../../../src/data/sources';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { SlotDeps } from '../../../../src/@types/loading/SlotDeps';

/** A stub slot whose `load` is a spy; other methods are no-ops. */
function stubSlot(name: string): AssetSlot<unknown, unknown> {
  return {
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

/** Minimal SlotDeps — the stub factories don't read it. */
function makeDeps(): SlotDeps {
  return { state: {} as never, cb: {} as never };
}

describe('buildSlotsFromRegistry', () => {
  it('builds one slot per non-external row, keyed by row.key', () => {
    const filamentSlot = stubSlot('filaments');
    const mcpmSlot = stubSlot('mcpm');
    const rows: AssetWiringRow[] = [
      {
        key: 'filaments',
        factory: () => filamentSlot,
        req: () => ({}),
        demand: () => false,
        priority: 0,
      },
      { key: 'mcpm', factory: () => mcpmSlot, req: () => ({}), demand: () => false, priority: 0 },
    ];

    const slots = buildSlotsFromRegistry(rows, makeDeps());

    expect(slots.size).toBe(2);
    expect(slots.get('filaments')).toBe(filamentSlot);
    expect(slots.get('mcpm')).toBe(mcpmSlot);
  });

  it('skips built:"external" rows — their factory is never called', () => {
    const externalFactory = vi.fn(() => {
      throw new Error('external rows must not be built');
    });
    const filamentSlot = stubSlot('filaments');
    const rows: AssetWiringRow[] = [
      {
        key: Source.SDSS,
        built: 'external',
        factory: externalFactory,
        req: (tier) => ({ source: Source.SDSS, tier }),
        demand: () => true,
        priority: 0,
      },
      {
        key: 'filaments',
        factory: () => filamentSlot,
        req: () => ({}),
        demand: () => false,
        priority: 0,
      },
    ];

    const slots = buildSlotsFromRegistry(rows, makeDeps());

    // The external row is absent; its throwing factory never ran.
    expect(externalFactory).not.toHaveBeenCalled();
    expect(slots.has(Source.SDSS)).toBe(false);
    expect(slots.size).toBe(1);
    expect(slots.get('filaments')).toBe(filamentSlot);
  });

  it('passes the deps bag to each factory and does not load any slot', () => {
    const deps = makeDeps();
    const factory = vi.fn(() => stubSlot('filaments'));
    const rows: AssetWiringRow[] = [
      { key: 'filaments', factory, req: () => ({}), demand: () => true, priority: 0 },
    ];

    const slots = buildSlotsFromRegistry(rows, deps);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(deps);
    // Purity: construction never triggers a load.
    expect(slots.get('filaments')!.load as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
