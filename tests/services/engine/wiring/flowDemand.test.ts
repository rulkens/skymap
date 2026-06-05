/**
 * flow demand — unit tests for the flow field's demand predicate.
 *
 * Drives the factored-out `evaluateRows(state, rows)` (same harness pattern as
 * `reevaluateDemand.test.ts`) with a single stub `flow` row whose demand reads
 * `ctx.flow.enabled`, against a minimal stub `EngineState` whose
 * `data.flow.enabled` we flip and whose `assetSlots.flow` is a spy slot.
 *
 * The behaviour under test is the flow layer's lazy / default-off contract:
 * the slot stays idle while flow is disabled and loads the moment it is
 * enabled. We don't exercise the load loop's idle-guard or throw handling here
 * — those are pinned in `reevaluateDemand.test.ts`; this file only proves the
 * `flow.enabled` surface routes through `buildDemandCtx` → the row's demand.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateRows } from '../../../../src/services/engine/wiring/reevaluateDemand';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';

type StubSlot = AssetSlot<unknown, unknown> & {
  load: ReturnType<typeof vi.fn>;
};

/** A stub flow slot whose `load` is a spy and whose state reports `idle`. */
function stubSlot(): StubSlot {
  const load = vi.fn();
  return {
    name: 'flow',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind: 'idle' }) as LoadState<unknown>,
    subscribe: () => () => {},
    forceReload: () => {},
    cancel: () => {},
  };
}

/**
 * Build a minimal EngineState carrying the slices the flow demand path reads
 * transitively (via buildDemandCtx + slotFor): `settings`, `sources`,
 * `requests`, `data.flow.enabled`, and `assetSlots.flow` (the named string-key
 * slot `slotFor('flow')` resolves).
 */
function makeState(flowEnabled: boolean, slot: AssetSlot<unknown, unknown>): EngineState {
  return {
    settings: {},
    sources: { drawMask: 0, tier: 'medium' },
    requests: new Set(),
    data: { flow: { enabled: flowEnabled } },
    assetSlots: { points: new Map(), flow: slot },
  } as unknown as EngineState;
}

/** The real-shaped flow row: void request, demand gated on `flow.enabled`. */
const flowRow: AssetWiringRow = {
  key: 'flow',
  factory: () => stubSlot(),
  req: () => undefined,
  demand: (ctx) => ctx.flow.enabled === true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('flow demand', () => {
  it('flow slot stays idle when flow.enabled is false', () => {
    const slot = stubSlot();
    const state = makeState(false, slot);
    evaluateRows(state, [flowRow]);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('flow slot loads when flow.enabled is true', () => {
    const slot = stubSlot();
    const state = makeState(true, slot);
    evaluateRows(state, [flowRow]);
    expect(slot.load).toHaveBeenCalledTimes(1);
  });
});
