/**
 * setStructureItemEnabled / setStructureLabelEnabled / setSurveyLabelEnabled —
 * fade orchestration unit tests.
 *
 * These drive the extracted module-level setters directly against a minimal
 * state stub (mirroring `setSourceVisibleFade.test.ts`). The structure setters
 * read `state.settings.structures.items` (the authoritative per-category gate);
 * the survey-label setter reads `state.settings.surveys.items`. Both read
 * `state.subsystems.{fades,scheduler}`. A mock of those surfaces suffices.
 *
 * The contract under test: a toggle drives the SAME per-layer fade handle the
 * producers read (`markerLayer{category}` / `labelLayer{structure,category}` /
 * `labelLayer{galaxyNames}`), so on/off is a smooth fade instead of a pop, AND
 * writes the authoritative item leaf (`structures.items[cat].enabled` /
 * `.labelEnabled`, `surveys.items[survey].labelEnabled`). The survey-label fade
 * fires only when the survey's registry row carries a `labelLayer` (famous
 * carries `galaxyNames`).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { FadeHandle } from '../../../src/@types/animation/FadeHandle';
import {
  setSurveyLabelEnabledForTest,
  setStructureItemEnabledForTest,
  setStructureLabelEnabledForTest,
} from '../../../src/services/engine/engine';

// ── Minimal fixture factory ───────────────────────────────────────────────

function makeFixture() {
  const fadeCalls: Array<{ handle: FadeHandle; target: number; duration: number }> = [];
  const fades = {
    label: 'fadeRegistry',
    register: vi.fn(),
    unregister: vi.fn(),
    fadeTo: vi.fn(async (h: FadeHandle, target: number, duration: number) => {
      fadeCalls.push({ handle: h, target, duration });
    }),
    setImmediate: vi.fn(),
    opacityOf: vi.fn(() => 1),
    isAnyAnimating: vi.fn(() => false),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  const structures = {};
  const galaxies = {};
  const state = {
    data: { structures, galaxies },
    settings: {
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
    },
    subsystems: {
      fades,
      scheduler: { requestRender: vi.fn() },
    },
  };
  const cb = {
    labels: {
      onLabelCategoryVisibilityChange: vi.fn(),
      onMarkerCategoryVisibilityChange: vi.fn(),
    },
  };
  return { state, cb, fades, structures, galaxies, fadeCalls };
}

// ── Ring/marker axis (setStructureItemEnabled) ───────────────────────────────

describe('setStructureItemEnabled — fade orchestration', () => {
  it('toggle OFF fires fadeTo(markerLayer{cluster}, 0, FADE_OUT) and writes items[cluster].enabled', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state as never, fx.cb as never, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'markerLayer', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.structures.items.cluster.enabled).toBe(false);
    expect(fx.cb.labels.onMarkerCategoryVisibilityChange).toHaveBeenCalledTimes(1);
    // Echo carries the derived record reflecting the just-written leaf.
    expect(fx.cb.labels.onMarkerCategoryVisibilityChange).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: false }),
    );
    expect(fx.state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('toggle ON fires fadeTo(markerLayer{cluster}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    fx.state.settings.structures.items.cluster.enabled = false;
    setStructureItemEnabledForTest(fx.state as never, fx.cb as never, 'cluster', true);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'markerLayer', category: 'cluster' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.structures.items.cluster.enabled).toBe(true);
  });
});

// ── Structure text axis (setStructureLabelEnabled) ───────────────────────────

describe('setStructureLabelEnabled — fade orchestration', () => {
  it('toggle OFF fires fadeTo(labelLayer{structure,cluster}, 0, FADE_OUT) and writes items[cluster].labelEnabled', () => {
    const fx = makeFixture();
    setStructureLabelEnabledForTest(fx.state as never, fx.cb as never, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'structure', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.structures.items.cluster.labelEnabled).toBe(false);
    expect(fx.cb.labels.onLabelCategoryVisibilityChange).toHaveBeenCalledTimes(1);
    expect(fx.cb.labels.onLabelCategoryVisibilityChange).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: false }),
    );
    expect(fx.state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
  });
});

// ── Survey label axis (setSurveyLabelEnabled) ────────────────────────────────

describe('setSurveyLabelEnabled — famous-galaxy survey', () => {
  it('famousGalaxy label toggle OFF fires fadeTo(labelLayer{galaxyNames}, 0) AND writes the survey item row', () => {
    const fx = makeFixture();
    setSurveyLabelEnabledForTest(fx.state as never, fx.cb as never, 'famousGalaxy', false);

    // famousGalaxy labels live on the shared galaxyNames layer (its registry
    // row's labelLayer), so a toggle fires that handle (no per-category key).
    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    // Single source of truth: the survey item row's labelEnabled flag.
    expect(fx.state.settings.surveys.items.famousGalaxy.labelEnabled).toBe(false);
    expect(fx.cb.labels.onLabelCategoryVisibilityChange).toHaveBeenCalledTimes(1);
    expect(fx.state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('famousGalaxy label toggle ON fires fadeTo(labelLayer{galaxyNames}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    fx.state.settings.surveys.items.famousGalaxy.labelEnabled = false;
    setSurveyLabelEnabledForTest(fx.state as never, fx.cb as never, 'famousGalaxy', true);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.surveys.items.famousGalaxy.labelEnabled).toBe(true);
  });
});
