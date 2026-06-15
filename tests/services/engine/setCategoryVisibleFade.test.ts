/**
 * setStructureItemEnabled / setStructureLabelEnabled / setSurveyLabelEnabled —
 * fade orchestration + store-write unit tests.
 *
 * These drive the extracted module-level setters directly against a minimal
 * state stub (mirroring `setSourceVisibleFade.test.ts`). Each setter writes the
 * authoritative item leaf THROUGH a real engine-owned settings store (the
 * fixture backs `state.settings` with `createSettingsStore` and a getter,
 * mirroring the engine's delegation) so the copy-on-write write notifies React's
 * `useSettingsStore` subscriber, then drives the matching FadeRegistry handle.
 *
 * The contract under test: a toggle drives the SAME per-layer fade handle the
 * producers read (`markerLayer{category}` / `labelLayer{structure,category}` /
 * `labelLayer{galaxyNames}`), so on/off is a smooth fade instead of a pop, AND
 * writes the authoritative item leaf (`structures.items[cat].enabled` /
 * `.labelEnabled`, `surveys.items[survey].labelEnabled`) through the store. The
 * survey-label fade fires only when the survey's registry row carries a
 * `labelLayer` (famous carries `galaxyNames`). fadeTo owns the render wake (the
 * real FadeRegistry wakes the scheduler internally), so the setters never call
 * requestRender — asserted via the untouched scheduler stub. There is no echo
 * callback any more: React reads the visibility records via store selectors.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { FadeId } from '../../../src/@types/animation/FadeId';
import { setStructureItemEnabledForTest } from '../../../src/services/engine/handles/setStructureItemEnabled';
import { setStructureLabelEnabledForTest } from '../../../src/services/engine/handles/setStructureLabelEnabled';
import { setSurveyLabelEnabledForTest } from '../../../src/services/engine/handles/setSurveyLabelEnabled';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';

// ── Minimal fixture factory ───────────────────────────────────────────────

function makeFixture() {
  const fadeCalls: Array<{ id: FadeId; target: number; duration: number }> = [];
  const fades = {
    label: 'fadeRegistry',
    register: vi.fn(),
    unregister: vi.fn(),
    fadeTo: vi.fn(async (h: FadeId, target: number, duration: number) => {
      fadeCalls.push({ id: h, target, duration });
    }),
    setImmediate: vi.fn(),
    opacityOf: vi.fn(() => 1),
    isAnyAnimating: vi.fn(() => false),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  // The setters write the item leaf THROUGH the engine-owned store (the
  // copy-on-write action), so the fixture backs `state.settings` with a real
  // store and exposes it via a getter — exactly the engine's `state.settings`
  // delegation. After the action runs, the getter hands back the fresh copy,
  // which is what the assertions read.
  const store = createSettingsStore({
    surveys: {
      enabled: true,
      items: {
        famousGalaxy: { enabled: true, labelEnabled: true },
      },
    },
    structures: {
      enabled: true,
      items: {
        cluster: { enabled: true, labelEnabled: true },
        supercluster: { enabled: true, labelEnabled: true },
        void: { enabled: true, labelEnabled: true },
        group: { enabled: true, labelEnabled: true },
      },
    },
  } as unknown as EngineSettingsState);
  const state = {
    get settings() {
      return store.getState();
    },
    subsystems: {
      fades,
      scheduler: { requestRender: vi.fn() },
    },
  };
  return { state, store, fades, fadeCalls };
}

// ── Ring/marker axis (setStructureItemEnabled) ───────────────────────────────

describe('setStructureItemEnabled — fade orchestration', () => {
  it('toggle OFF fires fadeTo(markerLayer{cluster}, 0, FADE_OUT) and writes items[cluster].enabled', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state as never, fx.store, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        id: { kind: 'markerLayer', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    // Re-read through the store: the write is copy-on-write, so the row is a
    // fresh object — reading the live state, not a captured reference.
    expect(fx.store.getState().structures.items.cluster.enabled).toBe(false);
    // fadeTo owns the wake — the setter must not call requestRender itself.
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });

  it('toggle ON fires fadeTo(markerLayer{cluster}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state as never, fx.store, 'cluster', false);
    fx.fadeCalls.length = 0;
    setStructureItemEnabledForTest(fx.state as never, fx.store, 'cluster', true);

    expect(fx.fadeCalls).toEqual([
      {
        id: { kind: 'markerLayer', category: 'cluster' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
    expect(fx.store.getState().structures.items.cluster.enabled).toBe(true);
  });

  it('preserves the category label axis when flipping the ring', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state as never, fx.store, 'cluster', false);

    expect(fx.store.getState().structures.items.cluster.labelEnabled).toBe(true);
  });
});

// ── Structure text axis (setStructureLabelEnabled) ───────────────────────────

describe('setStructureLabelEnabled — fade orchestration', () => {
  it('toggle OFF fires fadeTo(labelLayer{structure,cluster}, 0, FADE_OUT) and writes items[cluster].labelEnabled', () => {
    const fx = makeFixture();
    setStructureLabelEnabledForTest(fx.state as never, fx.store, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        id: { kind: 'labelLayer', layer: 'structure', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.store.getState().structures.items.cluster.labelEnabled).toBe(false);
    // The ring axis is untouched.
    expect(fx.store.getState().structures.items.cluster.enabled).toBe(true);
    // fadeTo owns the wake — the setter must not call requestRender itself.
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });
});

// ── Survey label axis (setSurveyLabelEnabled) ────────────────────────────────

describe('setSurveyLabelEnabled — famous-galaxy survey', () => {
  it('famousGalaxy label toggle OFF fires fadeTo(labelLayer{galaxyNames}, 0) AND writes the survey item row', () => {
    const fx = makeFixture();
    setSurveyLabelEnabledForTest(fx.state as never, fx.store, 'famousGalaxy', false);

    // famousGalaxy labels live on the shared galaxyNames layer (its registry
    // row's labelLayer), so a toggle fires that handle (no per-category key).
    expect(fx.fadeCalls).toEqual([
      {
        id: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    // Single source of truth: the survey item row's labelEnabled flag.
    expect(fx.store.getState().surveys.items.famousGalaxy.labelEnabled).toBe(false);
    // fadeTo owns the wake — the setter must not call requestRender itself.
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });

  it('famousGalaxy label toggle ON fires fadeTo(labelLayer{galaxyNames}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    setSurveyLabelEnabledForTest(fx.state as never, fx.store, 'famousGalaxy', false);
    fx.fadeCalls.length = 0;
    setSurveyLabelEnabledForTest(fx.state as never, fx.store, 'famousGalaxy', true);

    expect(fx.fadeCalls).toEqual([
      {
        id: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
    expect(fx.store.getState().surveys.items.famousGalaxy.labelEnabled).toBe(true);
  });
});
