/**
 * setSourceVisible — synchronous toggle integration tests.
 *
 * These drive `setSourceVisibleForTest` directly against a minimal state stub
 * rather than instantiating a full GPU engine.  The helper reads `state.sources`
 * and `state.subsystems.{fades,scheduler}` and writes the survey's `enabled`
 * flag through a real engine-owned settings store (the fixture backs
 * `state.settings` with `createSettingsStore` and a getter, mirroring the
 * engine's delegation), so a mock of those surfaces suffices.
 *
 * ### Model under test
 *
 * `setVisible` is SYNCHRONOUS and does ONE authoritative thing: it flips the
 * survey's `settings.surveys.items[id].enabled` — the single source of truth
 * for on/off — THROUGH the store's copy-on-write action, so React's
 * `useSettingsStore(selectVisibleSourceMask)` subscriber wakes.  It then fires
 * the fade (fire-and-forget) and recomputes the masks via `deriveSourceMasks`,
 * which it calls internally.  It does NOT write `drawMask`/`pickMask` itself;
 * those are derived outputs:
 *
 *   - draw = `enabled || opacity > 0` — a just-hidden survey keeps its draw
 *     bit through the fade-out tail, so it ramps down smoothly.
 *   - pick = `enabled` — non-clickable the instant it's toggled off.
 *
 * Because the derive runs inside the setter, the masks are already fresh after
 * the call returns — no `await`, no manual derive needed.  Loading is NOT the
 * helper's concern; the per-frame `reevaluateDemand` reads the derived
 * drawMask and loads the now-visible survey next frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source, SURVEY_SOURCES, SOURCE_REGISTRY } from '../../../src/data/sources';
import type { SurveyId } from '../../../src/@types/engine/data/SurveyId';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import { setSourceVisibleForTest } from '../../../src/services/engine/handles/setSourceVisible';
import { deriveSourceMasks } from '../../../src/services/engine/frame/deriveSourceMasks';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import { maskHas } from '../../../src/utils/sourceMask';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';

// ── Minimal fixture factory ───────────────────────────────────────────────
//
// `opacityFor` lets a case control the simulated fade opacity per survey
// `handle.source` — the input deriveSourceMasks reads for the draw bit's
// fade-out tail.  Default: every survey at opacity 0 (no fade in flight).

function makeFixture(opacityFor: (source: number) => number = () => 0) {
  const fadeCalls: Array<{ target: number; duration: number }> = [];
  const fades = {
    label: 'fadeRegistry',
    register: vi.fn(),
    unregister: vi.fn(),
    fadeTo: vi.fn((_h: unknown, target: number, duration: number) => {
      fadeCalls.push({ target, duration });
    }),
    setImmediate: vi.fn(),
    opacityOf: vi.fn((h: { source: number }) => opacityFor(h.source)),
    isAnyAnimating: vi.fn(() => false),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  // deriveSourceMasks (called inside the setter) packs bits for EVERY survey
  // source, so every survey id must have an items row or it would read
  // `undefined.enabled`.  Seed them all enabled; cases override the one under
  // test.
  const items = Object.fromEntries(
    SURVEY_SOURCES.map((s) => [
      SOURCE_REGISTRY[s].id as SurveyId,
      { enabled: true, labelEnabled: true },
    ]),
  );
  // The setter writes the `enabled` flag THROUGH the engine-owned store (the
  // copy-on-write action), so the fixture backs `state.settings` with a real
  // store and exposes it via a getter — exactly the engine's `state.settings`
  // delegation. After the action runs, the getter hands back the fresh copy,
  // which is what `deriveSourceMasks` and the assertions read.
  const store = createSettingsStore({ surveys: { items } } as unknown as EngineSettingsState);
  const state = {
    get settings() {
      return store.getState();
    },
    sources: {
      pickMask: 0,
      drawMask: 0,
      tier: 'medium' as const,
    },
    subsystems: {
      fades,
      scheduler: { requestRender: vi.fn() },
    },
  };
  // Seed the masks to match the all-enabled initial settings so a no-op
  // toggle (same `enabled`) is a true no-op against a consistent baseline.
  deriveSourceMasks(state as never);
  return { state, store, fades, fadeCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('setSourceVisible — synchronous toggle', () => {
  it('flips surveys.items[id].enabled synchronously (through the store)', () => {
    const fx = makeFixture();
    expect(fx.store.getState().surveys.items.sdss!.enabled).toBe(true);

    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false);

    // Re-read through the store: the write is copy-on-write, so the row is a
    // fresh object — reading the live state, not a captured reference.
    expect(fx.store.getState().surveys.items.sdss!.enabled).toBe(false);
  });

  it('fires fadeTo(0, FADE_OUT_DURATION_MS) on hide and fadeTo(1, FADE_IN_DURATION_MS) on show', () => {
    // Hide: start enabled, toggle off.
    const hide = makeFixture();
    setSourceVisibleForTest(hide.state as never, hide.store, Source.SDSS, false);
    expect(hide.fadeCalls).toEqual([{ target: 0, duration: FADE_OUT_DURATION_MS }]);

    // Show: start with SDSS disabled, toggle on.
    const show = makeFixture();
    show.store.getState().surveys.items.sdss!.enabled = false;
    setSourceVisibleForTest(show.state as never, show.store, Source.SDSS, true);
    expect(show.fadeCalls).toEqual([{ target: 1, duration: FADE_IN_DURATION_MS }]);
  });

  it('a hidden survey still fading out is DRAWN but not pickable', () => {
    // Simulate a fade-out still in flight: opacity 0.5 for SDSS.
    const fx = makeFixture((source) => (source === Source.SDSS ? 0.5 : 0));

    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false);

    // enabled is false, but opacity > 0 keeps the draw bit set (fade-out tail);
    // pick follows intent and is cleared immediately.
    expect(fx.store.getState().surveys.items.sdss!.enabled).toBe(false);
    expect(maskHas(fx.state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(fx.state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('re-show mid-fade sets enabled=true and keeps drawing', () => {
    const fx = makeFixture();

    // Hide, then immediately re-show (two sync calls, no await).
    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false);
    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, true);

    // The last toggle won: enabled is true, so both masks carry the bit.
    expect(fx.store.getState().surveys.items.sdss!.enabled).toBe(true);
    expect(maskHas(fx.state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(fx.state.sources.pickMask, Source.SDSS)).toBe(true);
  });

  it('clears the SDSS pick bit on hide (read off the derived mask, not an echo)', () => {
    const fx = makeFixture();

    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false);

    // The setter no longer fires an echo — React reads visibility via
    // `selectVisibleSourceMask` over the authoritative `enabled` bits. The
    // derived pick mask still drops the toggled-off survey's bit.
    expect(maskHas(fx.state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('never calls requestRender itself — fadeTo owns the wake', () => {
    // Every non-no-op path fires fadeTo (which wakes), and the masks are
    // derived per frame — no caller wake left to cover.  The no-op second
    // toggle early-returns and must stay wake-free too.
    const fx = makeFixture();

    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false);
    setSourceVisibleForTest(fx.state as never, fx.store, Source.SDSS, false); // no-op

    expect(fx.fades.fadeTo).toHaveBeenCalledTimes(1);
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });
});
