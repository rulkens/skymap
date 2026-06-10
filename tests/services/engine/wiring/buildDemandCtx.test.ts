/**
 * buildDemandCtx — unit tests for the demand-context builder.
 *
 * The builder maps `EngineState` into the read surfaces a demand predicate
 * consults. These tests target the three non-trivial surfaces: `isVisible`
 * (the survey's `settings.surveys.items[id].enabled` bit — intent, not the
 * fade-tail drawMask), `slotState` (slot accessor + idle fallback), and
 * `request` (the transient request-flag set). `settings` is a direct
 * passthrough and needs no behaviour test.
 *
 * Mocking strategy: inject a minimal `state` carrying only the slices the
 * builder reads — `settings` (including `surveys.items`), `requests`, and
 * `assetSlots`. No GPU resources are involved.
 */

import { describe, it, expect } from 'vitest';
import { buildDemandCtx } from '../../../../src/services/engine/wiring/buildDemandCtx';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { SurveyId } from '../../../../src/@types/engine/data/SurveyId';

/**
 * Build a minimal EngineState with only the fields buildDemandCtx reads.
 * `surveyItems` defaults to empty (no survey enabled — an absent items row
 * reads as not enabled), `requests` to empty, and the slot maps/fields to
 * empty so `slotState` falls back to 'idle' unless a test supplies a slot.
 * `sources` stays as a stub field the EngineState shape expects; the builder
 * itself never reads it.
 */
function makeState(
  opts: {
    surveyItems?: Partial<Record<SurveyId, { enabled: boolean }>>;
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
      surveys: { items: opts.surveyItems ?? {} },
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

  it("isVisible reflects the survey's enabled settings bit", () => {
    // SDSS enabled, GLADE disabled → isVisible mirrors intent, the same
    // field setSourceVisible writes; the fade-tail drawMask is irrelevant.
    const state = makeState({
      surveyItems: { sdss: { enabled: true }, glade: { enabled: false } },
    });
    const ctx = buildDemandCtx(state);
    expect(ctx.isVisible(Source.SDSS)).toBe(true);
    expect(ctx.isVisible(Source.Glade)).toBe(false);
  });

  it('isVisible reads an absent items row as not enabled', () => {
    // Non-survey codes (and surveys missing from the record) have no items
    // row — the lookup yields undefined, which must read as "not visible".
    const ctx = buildDemandCtx(makeState());
    expect(ctx.isVisible(Source.SDSS)).toBe(false);
    expect(ctx.isVisible(Source.Cluster)).toBe(false);
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
