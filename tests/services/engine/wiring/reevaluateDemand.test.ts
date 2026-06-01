/**
 * reevaluateDemand — unit tests for the guarded demand-evaluation loop.
 *
 * Tests exercise the factored-out `evaluateRows(state, rows)` with stub rows
 * and stub slots, so the loop logic is verified without the real ASSET_WIRING
 * registry (Task 10). The four behaviours under test:
 *
 *   - a row whose demand is true triggers `slot.load(row.req(tier))`,
 *   - a row whose demand is false does not load,
 *   - a throwing demand predicate is caught and does not stop later rows,
 *   - repeated evaluation is safe (idempotency lives in slot.load).
 *
 * Mocking strategy: stub slots live in `state.assetSlots.points` keyed by a
 * numeric SourceType; `slot.load` is a vi.fn so calls are assertable. Rows
 * carry numeric keys so `slotFor` resolves them through the points map.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateRows } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';

type StubSlot = AssetSlot<unknown, unknown> & { load: ReturnType<typeof vi.fn> };

/** A stub slot whose `load` is a spy; other methods are no-ops. */
function stubSlot(): StubSlot {
  const load = vi.fn();
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    forceReload: () => {},
    cancel: () => {},
  };
}

/**
 * Build a minimal EngineState with the slices evaluateRows reads transitively
 * (via buildDemandCtx + slotFor): `settings`, `sources.{drawMask,tier}`,
 * `requests`, and a `points` map carrying the stub slots.
 */
function makeState(
  points: Map<SourceType, AssetSlot<unknown, unknown>>,
): EngineState {
  return {
    settings: {},
    sources: { drawMask: 0, tier: 'medium' },
    requests: new Set(),
    assetSlots: { points },
  } as unknown as EngineState;
}

/** A wiring row over a numeric (point-slot) key with overridable demand/req. */
function row(
  key: SourceType,
  demand: AssetWiringRow['demand'],
  req: AssetWiringRow['req'] = (tier) => ({ source: key, tier }),
): AssetWiringRow {
  return { key, factory: () => stubSlot(), req, demand };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateRows', () => {
  it('loads a row whose demand returns true', () => {
    const slot = stubSlot();
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => true)]);
    expect(slot.load).toHaveBeenCalledTimes(1);
    // The request is derived from the active tier via row.req.
    expect(slot.load).toHaveBeenCalledWith({ source: Source.SDSS, tier: 'medium' });
  });

  it('does not load a row whose demand returns false', () => {
    const slot = stubSlot();
    const state = makeState(new Map([[Source.SDSS, slot]]));
    evaluateRows(state, [row(Source.SDSS, () => false)]);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('a throwing demand predicate is caught and does not stop later rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdss = stubSlot();
    const glade = stubSlot();
    const state = makeState(
      new Map([
        [Source.SDSS, sdss],
        [Source.Glade, glade],
      ]),
    );
    evaluateRows(state, [
      row(Source.SDSS, () => {
        throw new Error('boom');
      }),
      row(Source.Glade, () => true),
    ]);
    // First row's throw is swallowed + warned; the second row still loads.
    expect(sdss.load).not.toHaveBeenCalled();
    expect(glade.load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('re-evaluation is safe to call twice', () => {
    const slot = stubSlot();
    const state = makeState(new Map([[Source.SDSS, slot]]));
    const rows = [row(Source.SDSS, () => true)];
    expect(() => {
      evaluateRows(state, rows);
      evaluateRows(state, rows);
    }).not.toThrow();
    // No internal dedup — each true evaluation calls load (idempotency is
    // the slot's contract, not the loop's).
    expect(slot.load).toHaveBeenCalledTimes(2);
  });

  it('skips a true-demand row with no slot without throwing', () => {
    // slotFor returns undefined for a key with no minted slot; the optional
    // chain makes the load a no-op rather than a crash.
    const state = makeState(new Map());
    expect(() => evaluateRows(state, [row(Source.SDSS, () => true)])).not.toThrow();
  });
});
