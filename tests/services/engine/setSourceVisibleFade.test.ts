/**
 * setSourceVisible — fade orchestration integration tests.
 *
 * These tests drive `setSourceVisibleForTest` directly against a minimal
 * state stub rather than instantiating a full GPU engine.  The exported
 * helper reads only `state.sources` / `state.subsystems.fades` /
 * `state.subsystems.scheduler`, so a mock of those three surfaces is
 * sufficient.
 *
 * Three cases:
 *   1. Toggle OFF  — pickMask clears immediately; fadeTo(0, FADE_OUT)
 *      called; drawMask clears after the await.
 *   2. Toggle ON   — drawMask sets before fadeTo; fadeTo(1, FADE_IN) called.
 *   3. Rapid off → on — by the time the fade-out promise resolves,
 *      opacityOf returns 1 (the re-toggle won); drawMask must stay set.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../../src/data/sources';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import { setSourceVisibleForTest } from '../../../src/services/engine/engine';

// ── Minimal fixture factory ───────────────────────────────────────────────

function makeFixture(initialMask: number) {
  const fadeCalls: Array<{ target: number; duration: number }> = [];
  const fades = {
    label: 'fadeRegistry',
    register: vi.fn(),
    unregister: vi.fn(),
    fadeTo: vi.fn(async (_h: unknown, target: number, duration: number) => {
      fadeCalls.push({ target, duration });
    }),
    setImmediate: vi.fn(),
    opacityOf: vi.fn(() => 0),
    isAnyAnimating: vi.fn(() => false),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  const state = {
    sources: {
      pickMask: initialMask,
      drawMask: initialMask,
      tier: 'medium' as const,
    },
    subsystems: {
      fades,
      scheduler: { requestRender: vi.fn() },
    },
    // setSourceVisibleImpl reads `assetSlots.points.get(source)?.load(...)`
    // to lazy-load surveys that were hidden at boot.  Empty Map is
    // fine — the `?.` short-circuits when no slot is registered.
    assetSlots: {
      points: new Map(),
      milliquasNames: null,
    },
  };
  return { state, fades, fadeCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('setSourceVisible — fade orchestration', () => {
  it('toggle OFF flips pickMask immediately, awaits FADE_OUT_DURATION_MS, then clears drawMask', async () => {
    const fx = makeFixture(0b11111);
    // The fixture default opacityOf returns 0, matching the post-fade
    // state — no reassignment needed for this case (the rapid-toggle
    // case below DOES override to simulate the concurrent fade-in).

    await setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, false);

    // pickMask bit cleared synchronously before fadeTo:
    expect((fx.state.sources.pickMask >> Source.SDSS) & 1).toBe(0);
    // fadeTo called with target=0 and the fade-out duration:
    expect(fx.fadeCalls).toEqual([{ target: 0, duration: FADE_OUT_DURATION_MS }]);
    // drawMask bit cleared after the await (opacityOf returned 0):
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(0);
  });

  it('toggle ON sets drawMask before fadeTo, then awaits FADE_IN_DURATION_MS', async () => {
    const fx = makeFixture(0); // every bit off

    await setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, true);

    // pickMask bit set:
    expect((fx.state.sources.pickMask >> Source.SDSS) & 1).toBe(1);
    // drawMask bit set before the fade starts (so the renderer starts
    // drawing this frame at opacity 0 and fades in):
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
    // fadeTo called with target=1 and the fade-in duration:
    expect(fx.fadeCalls).toEqual([{ target: 1, duration: FADE_IN_DURATION_MS }]);
  });

  it('rapid toggle off → on within fade-out leaves drawMask set (last-issued wins)', async () => {
    const fx = makeFixture(0b11111);

    // First toggle off — pickMask clears, fadeTo(0, FADE_OUT_DURATION_MS) starts.
    const p1 = setSourceVisibleForTest(
      fx.state as never,
      { cb: {} } as never,
      Source.SDSS,
      false,
    );

    // Immediately toggle on — pickMask sets, fadeTo(1, FADE_IN_DURATION_MS) starts.
    // By the time p1 resolves, opacityOf returns 1 (the re-toggle won).
    fx.fades.opacityOf = vi.fn(() => 1);
    const p2 = setSourceVisibleForTest(
      fx.state as never,
      { cb: {} } as never,
      Source.SDSS,
      true,
    );

    await Promise.all([p1, p2]);

    // The final drawMask state reflects the last-issued fade (opacity > 0),
    // so the bit must remain set even though p1's fade-out also resolved.
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
  });
});
