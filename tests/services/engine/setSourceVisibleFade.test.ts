/**
 * setSourceVisible — fade orchestration integration tests.
 *
 * These tests drive `setSourceVisibleForTest` directly against a minimal
 * state stub rather than instantiating a full GPU engine.  The exported
 * helper reads only `state.sources` / `state.subsystems.fades` /
 * `state.subsystems.scheduler`, so a mock of those surfaces is sufficient.
 *
 * Loading is NOT the helper's concern — it flips `pickMask`/`drawMask` and
 * fades. The per-frame `reevaluateDemand` in the render loop reads the
 * flipped drawMask and loads the now-visible survey on the next frame; the
 * demand-table net (`wiring/demandTable.test.ts`) proves that load policy.
 * Here we only pin the mask + fade orchestration.
 *
 * Cases:
 *   1. Toggle OFF  — pickMask clears immediately; fadeTo(0, FADE_OUT)
 *      called; drawMask clears after the await.
 *   2. Toggle ON   — drawMask sets before the fade; fadeTo(1, FADE_IN) called.
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
    // The impl never touches assetSlots — loading is the render loop's
    // per-frame reevaluateDemand. Kept as an empty bag so any future read
    // short-circuits harmlessly.
    assetSlots: {
      points: new Map(),
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

  it('toggle ON sets drawMask before the fade, then awaits FADE_IN_DURATION_MS', async () => {
    const fx = makeFixture(0); // every bit off

    await setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, true);

    // pickMask bit set:
    expect((fx.state.sources.pickMask >> Source.SDSS) & 1).toBe(1);
    // drawMask bit set before the fade starts (so the renderer starts
    // drawing this frame at opacity 0 and fades in). The per-frame
    // reevaluateDemand reads this bit and loads the survey next frame.
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
    // fadeTo called with target=1 and the fade-in duration:
    expect(fx.fadeCalls).toEqual([{ target: 1, duration: FADE_IN_DURATION_MS }]);
  });

  it('rapid toggle off → on within fade-out leaves drawMask set (last-issued wins)', async () => {
    const fx = makeFixture(0b11111);

    // First toggle off — pickMask clears, fadeTo(0, FADE_OUT_DURATION_MS) starts.
    const p1 = setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, false);

    // Immediately toggle on — pickMask sets, fadeTo(1, FADE_IN_DURATION_MS) starts.
    // By the time p1 resolves, opacityOf returns 1 (the re-toggle won).
    fx.fades.opacityOf = vi.fn(() => 1);
    const p2 = setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, true);

    await Promise.all([p1, p2]);

    // The final drawMask state reflects the last-issued fade (opacity > 0),
    // so the bit must remain set even though p1's fade-out also resolved.
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
  });

  it('setSourceVisible wakes after the fade completes (final drawMask write lands on a rendered frame)', async () => {
    // This test pins the post-fade requestRender at engine.ts ~:241.
    // That wake is essential: the final drawMask write happens in a microtask
    // after the fade promise resolves, so no channel wake (fadeTo or otherwise)
    // covers it.  Without this call the renderer serves one stale frame after
    // the fade completes — the last frame with opacity > 0 for a fade-out, or
    // the first frame with the cleared bit not yet read.
    //
    // We use a manually-controlled deferred rather than an instantly-resolving
    // mock so the assertion cannot be fooled by a regression of the form
    //   const p = fadeTo(...); requestRender(); await p;
    // which would call requestRender before the fade resolves and still pass an
    // invocationCallOrder-based check.
    const fx = makeFixture(0b11111);

    let resolveFade!: () => void;
    const fadePromise = new Promise<void>((r) => {
      resolveFade = r;
    });
    (fx.fades.fadeTo as ReturnType<typeof vi.fn>).mockReturnValue(fadePromise);

    const schedulerSpy = fx.state.subsystems.scheduler.requestRender as ReturnType<typeof vi.fn>;

    // Start the toggle without awaiting — the fade is now suspended.
    const done = setSourceVisibleForTest(
      fx.state as never,
      { cb: {} } as never,
      Source.SDSS,
      false,
    );

    // Flush microtasks so any synchronous-path wakes have already landed.
    // Baseline: the fixture produces no pre-fade requestRender calls, so the
    // count should be 0 here.  The comment below guards against a reintroduced
    // pre-fade wake, not against the fixture's known state.
    await Promise.resolve();
    const callsBeforeFadeResolves = schedulerSpy.mock.calls.length;
    // No post-fade wake should have arrived yet — the fade is still pending.
    expect(callsBeforeFadeResolves).toBe(0);

    // Resolve the deferred fade and let the continuation run.
    resolveFade();
    await done;

    // Exactly one additional wake must have arrived after the fade resolved.
    expect(schedulerSpy.mock.calls.length).toBe(callsBeforeFadeResolves + 1);

    // And the drawMask bit must have been cleared (opacityOf returns 0):
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(0);
  });
});
