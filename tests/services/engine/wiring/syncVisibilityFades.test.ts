/**
 * syncVisibilityFades — unit tests for the private per-row `applyIntent`.
 *
 * `applyIntent` is the fades-ONLY primitive of the intent → fade bridge. These
 * tests isolate its five obligations:
 *
 *   1. Animated: read intent, `fadeTo` the handle to 1 (FADE_IN) or 0 (FADE_OUT).
 *   2. Non-animated: `setImmediate` instead, never `fadeTo`.
 *   3. An explicit `guard() === false` skips the whole op — no fade, no post.
 *   4. `post` runs after the fade, with `(state, item)`.
 *   5. It NEVER calls `writeIntent` — settings writes are the public bridge's job.
 *
 * Strategy: a stubbed fades registry with typed spies, plus hand-built FadeLayer
 * rows whose intent/guard/post/handle the test controls. Driving these isolates
 * one behaviour per test without standing up the real FADE_LAYERS or a GPU.
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

// ── Fixtures ──────────────────────────────────────────────────────────
//
// The state slice applyIntent feeds the row closures. We only populate
// `settings` + `subsystems.fades`; the test rows never read `assetSlots`/
// `sources`, so those stay absent and the cast bridges the gap the same way
// production does.
type ApplyIntentState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'sources'>;

function makeState(): {
  state: ApplyIntentState;
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>;
  setImmediate: ReturnType<typeof vi.fn<(id: FadeId, v: number) => void>>;
} {
  const fadeTo = vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeId, v: number) => void>();
  const state = {
    settings: {} as EngineSettingsState,
    subsystems: { fades: { fadeTo, setImmediate } },
  } as unknown as ApplyIntentState;
  return { state, fadeTo, setImmediate };
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

  it('never writes settings', () => {
    const { state } = makeState();
    const writeIntent =
      vi.fn<(settings: EngineSettingsState, item: undefined, value: boolean) => void>();

    const row = makeRow({ writeIntent });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(writeIntent).not.toHaveBeenCalled();
  });
});
