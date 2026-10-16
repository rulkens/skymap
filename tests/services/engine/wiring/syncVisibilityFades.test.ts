/**
 * syncVisibilityFades — the private per-row `applyIntent`, driven against hand-built
 * FadeLayer rows whose intent/guard/post/handle the test controls, isolating one
 * obligation per test. The manifest holds no rows any more, so nothing drives the
 * public bridges here.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { FadeLayer } from '../../../../src/@types/animation/FadeLayer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../../src/services/animation/fadeController';
import { applyIntentForTest } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { FADE_LAYERS } from '../../../../src/services/engine/wiring/fadeLayers';

// ── Fixtures ──────────────────────────────────────────────────────────
//
// The state slice applyIntent feeds the row closures — mirrors production's
// `ApplyIntentState` (no `sources`: with the survey row's mask-recompute `post`
// gone, no row closure reads it). We only populate `settings` +
// `subsystems.fades`; the test rows never read `assetSlots`, so those stay
// absent and the cast bridges the gap the same way production does.
type ApplyIntentState = Pick<
  EngineState,
  'settings' | 'subsystems' | 'assetSlots' | 'gpu' | 'fadeRows'
>;

function makeState(): {
  state: ApplyIntentState;
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>;
  setImmediate: ReturnType<typeof vi.fn<(id: FadeId, v: number) => void>>;
  targetOf: ReturnType<typeof vi.fn<(id: FadeId) => number | null>>;
} {
  const fadeTo = vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeId, v: number) => void>();
  // null never matches a real 0/1 target, so existing tests (which don't care
  // about the skip) keep seeing every fadeTo/setImmediate call fire.
  const targetOf = vi.fn<(id: FadeId) => number | null>(() => null);
  const state = {
    settings: {} as EngineSettingsState,
    subsystems: { fades: { fadeTo, setImmediate, targetOf } },
    fadeRows: FADE_LAYERS,
  } as unknown as ApplyIntentState;
  return { state, fadeTo, setImmediate, targetOf };
}

// A handle the rows return; the concrete value is irrelevant to applyIntent.
const HANDLE: FadeId = { kind: 'milkyWay' };

// Minimal intent row at Item = undefined. Callers override fields per test.
function makeRow(over: Partial<FadeLayer<undefined>> = {}): FadeLayer<undefined> {
  return {
    key: 'milkyWayDisk',
    expand: () => [undefined],
    handle: () => HANDLE,
    seed: () => 0,
    intent: () => true,
    ...over,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('applyIntent', () => {
  it('animate fades to intent target', () => {
    const { state, fadeTo, setImmediate } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 1, FADE_IN_DURATION_MS);

    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, FADE_OUT_DURATION_MS);

    expect(setImmediate).not.toHaveBeenCalled();
  });

  it('non-animate uses setImmediate, never fadeTo', () => {
    const { state, fadeTo, setImmediate } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: false });
    expect(setImmediate).toHaveBeenCalledWith(HANDLE, 1);

    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: false });
    expect(setImmediate).toHaveBeenCalledWith(HANDLE, 0);

    expect(fadeTo).not.toHaveBeenCalled();
  });

  it('skips guarded-off rows entirely', () => {
    const { state, fadeTo, setImmediate } = makeState();
    const post = vi.fn<(state: EngineState, item: undefined) => void>();

    const row = makeRow({ guard: () => false, post });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(fadeTo).not.toHaveBeenCalled();
    expect(setImmediate).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('runs post after the fade', () => {
    const { state } = makeState();
    const post = vi.fn<(state: EngineState, item: undefined) => void>();

    const row = makeRow({ post });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(state, undefined);
  });

  it('uses the durationMs override when given', () => {
    const { state, fadeTo } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: true, durationMs: 1234 });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 1, 1234);
    // The override must not equal the default so this assertion is meaningful.
    expect(1234).not.toBe(FADE_IN_DURATION_MS);

    fadeTo.mockClear();
    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: true, durationMs: 1234 });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, 1234);
    expect(1234).not.toBe(FADE_OUT_DURATION_MS);
  });

  it('does not re-issue fadeTo to a target already held', () => {
    const { state, fadeTo, targetOf } = makeState();
    targetOf.mockReturnValue(1);

    const row = makeRow({ intent: () => true });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(fadeTo).not.toHaveBeenCalled();
  });

  it('does not re-issue setImmediate to a target already held', () => {
    const { state, setImmediate, targetOf } = makeState();
    targetOf.mockReturnValue(0);

    const row = makeRow({ intent: () => false });
    applyIntentForTest(state, row, undefined, { animate: false });

    expect(setImmediate).not.toHaveBeenCalled();
  });

  it('a held target still runs guard and post', () => {
    // A row's `post` side effect must re-run every sync even when the fade
    // write itself is skipped, so a demand-loaded layer that idled back out
    // under unchanged settings still gets re-armed.
    const { state, targetOf } = makeState();
    targetOf.mockReturnValue(1);
    const post = vi.fn<(state: EngineState, item: undefined) => void>();

    const row = makeRow({ intent: () => true, post });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retargets an in-flight fade whose intent flipped', () => {
    const { state, fadeTo, targetOf } = makeState();
    targetOf.mockReturnValue(1); // in flight toward / holding 1

    const row = makeRow({ intent: () => false }); // this sync's intent flipped to off
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(fadeTo).toHaveBeenCalledTimes(1);
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, FADE_OUT_DURATION_MS);
  });
});
