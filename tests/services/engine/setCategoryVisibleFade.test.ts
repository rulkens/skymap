/**
 * setStructureItemEnabled / setStructureLabelEnabled / setCategoryLabelVisible —
 * fade orchestration unit tests.
 *
 * These drive the extracted module-level setters directly against a minimal
 * state stub (mirroring `setSourceVisibleFade.test.ts`). The structure setters
 * read `state.settings.structures.items` (the authoritative per-category gate)
 * and `state.subsystems.{fades,scheduler}`; the famous-label setter additionally
 * reads `state.data.galaxies`. A mock of those surfaces suffices.
 *
 * The contract under test: a category toggle drives the SAME per-category fade
 * handle the producers read (`markerLayer{category}` /
 * `labelLayer{structure,category}` / `labelLayer{galaxyNames}`), so on/off is a
 * smooth fade instead of a pop, AND writes the authoritative item leaf
 * (`items[cat].enabled` / `.labelEnabled`). famousGalaxy has no item row, so its
 * label toggle writes the still-live flat `labelCategoryVisibility` record.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { FadeHandle } from '../../../src/@types/animation/FadeHandle';
import {
  setCategoryLabelVisibleForTest,
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

// ── Famous label axis (setCategoryLabelVisible) ──────────────────────────────

describe('setCategoryLabelVisible — famous-galaxy branch', () => {
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
    // Famous still writes the flat label record (it has no structures.items row).
    expect(fx.state.settings.labelCategoryVisibility.famousGalaxy).toBe(false);
    expect(fx.cb.labels.onLabelCategoryVisibilityChange).toHaveBeenCalledTimes(1);
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

  it('a structure category routed through setCategoryLabelVisible delegates to the structure label axis', () => {
    const fx = makeFixture();
    setCategoryLabelVisibleForTest(fx.state as never, fx.cb as never, 'cluster', false);

    // Routes to the structure label axis: fades the structure handle + writes
    // the item leaf, NOT the flat famous record.
    expect(fx.fadeCalls).toEqual([
      {
        handle: { kind: 'labelLayer', layer: 'structure', category: 'cluster' },
        target: 0,
        duration: FADE_OUT_DURATION_MS,
      },
    ]);
    expect(fx.state.settings.structures.items.cluster.labelEnabled).toBe(false);
    expect(fx.galaxies.setFamousLabelsVisible).not.toHaveBeenCalled();
  });
});
