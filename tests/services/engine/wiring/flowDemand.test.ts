/**
 * flow demand — unit tests for the flow field's demand predicate.
 *
 * Drives the factored-out `evaluateRows(state, rows)` (same harness pattern as
 * `reevaluateDemand.test.ts`) with a single stub `flow` row whose demand reads
 * `ctx.settings.flow.enabled`, against a minimal stub `EngineState` whose
 * `settings.flow.enabled` we flip and whose `assetSlots.flow` is a spy slot.
 *
 * Flow is a singleton overlay layer: its master gate lives in `settings.flow`
 * alongside filaments/milkyWay, so the predicate reads the existing `settings`
 * surface — no bespoke DemandCtx surface (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`).
 *
 * The behaviour under test is the flow layer's lazy / default-off contract:
 * the slot stays idle while flow is disabled and loads the moment it is
 * enabled. We don't exercise the load loop's idle-guard or throw handling here
 * — those are pinned in `reevaluateDemand.test.ts`; this file only proves the
 * `settings.flow.enabled` surface routes through `buildDemandCtx` → the row's
 * demand.
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
 * transitively (via buildDemandCtx + slotFor): `settings.flow.enabled` (+ the
 * top-level `tier`), `requests`, `data`, and `assetSlots.flow` (the named
 * string-key slot `slotFor('flow')` resolves).
 */
function makeState(flowEnabled: boolean, slot: AssetSlot<unknown, unknown>): EngineState {
  return {
    tier: 'medium',
    settings: { tier: 'medium', flow: { enabled: flowEnabled } },
    requests: new Set(),
    data: {},
    assetSlots: { points: new Map(), flow: slot },
  } as unknown as EngineState;
}

/** The real-shaped flow row: void request, demand gated on `settings.flow.enabled`. */
const flowRow: AssetWiringRow = {
  key: 'flow',
  factory: () => stubSlot(),
  req: () => undefined,
  demand: (ctx) => ctx.settings.flow.enabled,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('flow demand', () => {
  it('flow slot stays idle when settings.flow.enabled is false', () => {
    const slot = stubSlot();
    const state = makeState(false, slot);
    evaluateRows(state, [flowRow]);
    expect(slot.load).not.toHaveBeenCalled();
  });

  it('flow slot loads when settings.flow.enabled is true', () => {
    const slot = stubSlot();
    const state = makeState(true, slot);
    evaluateRows(state, [flowRow]);
    expect(slot.load).toHaveBeenCalledTimes(1);
  });
});
