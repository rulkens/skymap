/**
 * buildDemandCtx — unit tests for the demand-context builder.
 *
 * The builder maps `EngineState` into the read surfaces a demand predicate
 * consults. These tests target the two non-trivial surfaces: `slotState`
 * (slot accessor + idle fallback) and `request` (the transient request-flag
 * set). `settings` is a direct passthrough and needs no behaviour test.
 *
 * Mocking strategy: inject a minimal `state` carrying only the slices the
 * builder reads — `settings`, `requests`, and `assetSlots`. No GPU
 * resources are involved.
 */

import { describe, it, expect } from 'vitest';
import { buildDemandCtx } from '../../../../src/services/engine/wiring/buildDemandCtx';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';

/**
 * Build a minimal EngineState with only the fields buildDemandCtx reads.
 * `requests` defaults to empty, and the slot maps/fields to empty so
 * `slotState` falls back to 'idle' unless a test supplies a slot.
 * `sources` stays as a stub field the EngineState shape expects; the builder
 * itself never reads it.
 */
function makeState(
  opts: {
    requests?: Set<RequestKey>;
    points?: Map<SourceType, AssetSlot<unknown, unknown>>;
    famousMetaState?: LoadState<unknown>['kind'];
  } = {},
): EngineState {
  const famousMeta =
    opts.famousMetaState === undefined
      ? null
      : ({ state: () => ({ kind: opts.famousMetaState }) } as unknown as AssetSlot<
          unknown,
          unknown
        >);
  return {
    settings: {
      marker: 'sentinel',
      galaxyCatalogs: { items: {} },
      volumes: { items: {} },
    },
    sources: { drawMask: 0 },
    requests: opts.requests ?? new Set<RequestKey>(),
    assetSlots: {
      points: opts.points ?? new Map(),
      famousMeta,
    },
  } as unknown as EngineState;
}

describe('buildDemandCtx', () => {
  it('settings is the engine settings passthrough', () => {
    const state = makeState();
    const ctx = buildDemandCtx(state);
    // Identity passthrough — predicates read the live settings object.
    expect(ctx.settings).toBe(state.settings);
  });

  it('slotState returns idle for an absent slot', () => {
    // A not-yet-minted slot (null field, missing map entry) reads as 'idle' —
    // never loaded is exactly what idle means.
    const ctx = buildDemandCtx(makeState());
    expect(ctx.slotState('famousMeta')).toBe('idle');
    expect(ctx.slotState(Source.SDSS)).toBe('idle');
  });

  it('slotState reflects a present slot', () => {
    const ctx = buildDemandCtx(makeState({ famousMetaState: 'ready' }));
    expect(ctx.slotState('famousMeta')).toBe('ready');
  });

  it('request reflects the request flag set', () => {
    const state = makeState({ requests: new Set<RequestKey>(['paletteOpened']) });
    const ctx = buildDemandCtx(state);
    expect(ctx.request('paletteOpened')).toBe(true);

    const empty = buildDemandCtx(makeState());
    expect(empty.request('paletteOpened')).toBe(false);
  });
});
