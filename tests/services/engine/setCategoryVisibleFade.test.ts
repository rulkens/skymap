/**
 * setCategory{Label,Marker}Visible — fade orchestration unit tests.
 *
 * These drive the extracted module-level setters directly against a minimal
 * state stub (mirroring `setSourceVisibleFade.test.ts`). The setters read only
 * `state.data.galaxies` (famous-galaxy label branch), `state.settings`, and
 * `state.subsystems.{fades,scheduler}`, so a mock of those surfaces suffices.
 * Structure-category visibility is now a pure FadeRegistry concern — the
 * setters fire `fadeTo` and no longer write any structure-store flag.
 *
 * The contract under test: a category toggle drives the SAME per-category fade
 * handle the producers read (`markerLayer{category}` /
 * `labelLayer{structure,category}` / `labelLayer{galaxyNames}`), so on/off is a smooth
 * fade instead of a pop. fadeTo owns the render wake (the real FadeRegistry
 * wakes the scheduler internally), so the setters never call requestRender —
 * asserted via the untouched scheduler stub.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { FadeHandle } from '../../../src/@types/animation/FadeHandle';
import {
  setCategoryLabelVisibleForTest,
  setCategoryMarkerVisibleForTest,
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
  const galaxies = {
    setFamousLabelsVisible: vi.fn(),
  };
  const state = {
    data: { structures, galaxies },
    settings: {
      labelCategoryVisibility: {
        cluster: true,
        supercluster: true,
        void: true,
        group: true,
        famousGalaxy: true,
      },
      markerCategoryVisibility: {
        cluster: true,
        supercluster: true,
        void: true,
        group: true,
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

// ── Marker setter ──────────────────────────────────────────────────────────

describe('setCategoryMarkerVisible — fade orchestration', () => {
  it('toggle OFF fires fadeTo(markerLayer{cluster}, 0, FADE_OUT)', () => {
    const fx = makeFixture();
    setCategoryMarkerVisibleForTest(fx.state as never, fx.cb as never, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'markerLayer', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.markerCategoryVisibility.cluster).toBe(false);
    expect(fx.cb.labels.onMarkerCategoryVisibilityChange).toHaveBeenCalledTimes(1);
    // fadeTo owns the wake — the setter must not call requestRender itself.
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });

  it('toggle ON fires fadeTo(markerLayer{cluster}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    setCategoryMarkerVisibleForTest(fx.state as never, fx.cb as never, 'cluster', true);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'markerLayer', category: 'cluster' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
  });
});

// ── Label setter ───────────────────────────────────────────────────────────

describe('setCategoryLabelVisible — fade orchestration', () => {
  it('toggle OFF on a structure category fires fadeTo(labelLayer{structure,cluster}, 0, FADE_OUT)', () => {
    const fx = makeFixture();
    setCategoryLabelVisibleForTest(fx.state as never, fx.cb as never, 'cluster', false);

    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'structure', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.labelCategoryVisibility.cluster).toBe(false);
    expect(fx.cb.labels.onLabelCategoryVisibilityChange).toHaveBeenCalledTimes(1);
    // fadeTo owns the wake — the setter must not call requestRender itself.
    expect(fx.state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });

  it('famousGalaxy label toggle OFF fires fadeTo(labelLayer{galaxyNames}, 0) AND sets famous visibility', () => {
    const fx = makeFixture();
    setCategoryLabelVisibleForTest(fx.state as never, fx.cb as never, 'famousGalaxy', false);

    expect(fx.galaxies.setFamousLabelsVisible).toHaveBeenCalledWith(false);
    // famousGalaxy labels reuse the shared galaxyNames layer (no per-category key).
    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.labelCategoryVisibility.famousGalaxy).toBe(false);
  });

  it('famousGalaxy label toggle ON fires fadeTo(labelLayer{galaxyNames}, 1, FADE_IN)', () => {
    const fx = makeFixture();
    setCategoryLabelVisibleForTest(fx.state as never, fx.cb as never, 'famousGalaxy', true);

    expect(fx.galaxies.setFamousLabelsVisible).toHaveBeenCalledWith(true);
    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'galaxyNames' },
        target: 1,
        duration: FADE_IN_DURATION_MS,
      },
    ]);
  });
});
