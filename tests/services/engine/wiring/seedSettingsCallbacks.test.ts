/**
 * seedSettingsCallbacks — unit tests for the settings-callback fan-out.
 *
 * The helper is a pure dispatch with no engine state. Every settings cluster
 * has migrated to the engine-owned store, so the fan-out is now an inert husk:
 * it fires NOTHING. The tests assert that contract — no optional callback rings,
 * no required callback rings, and the call never throws — so a regression that
 * reintroduces an echo (or breaks the optional-chaining safety) shows up here.
 * Phase 3 deletes the helper + its `SettingsCallbackSeed` argument together.
 */

import { describe, it, expect, vi } from 'vitest';

import { seedSettingsCallbacks } from '../../../../src/services/engine/wiring/seedSettingsCallbacks';
import type { SettingsCallbackSeed } from '../../../../src/@types/engine/wiring/SettingsCallbackSeed';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { BiasMode } from '../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';

function makeSnapshot(): SettingsCallbackSeed {
  return {
    pointSize: 2.5,
    brightness: 1.0,
    autoRotate: false,
    galaxyTexturesEnabled: true,
    highlightFallback: true,
    realOnlyMode: false,
    depthFadeEnabled: true,
    showPickBuffer: false,
    showDiskRadiusRing: false,
    biasMode: BiasMode.None,
    absMagLimit: -19.5,
    toneMapCurve: ToneMapCurve.Reinhard,
    exposure: 1.2,
    visibleSourceMask: 0b111,
  };
}

function makeRequiredCallbacks(): EngineCallbacks {
  // The two required clusters (`lifecycle`, `selection`) aren't fired by
  // the helper, but the EngineCallbacks type requires them — fill with
  // no-op spies.
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: {
      onHoverChange: vi.fn(),
      onSelectChange: vi.fn(),
    },
  };
}

describe('seedSettingsCallbacks', () => {
  it('fires NO optional settings callback — every cluster lives in the store', () => {
    const surveys = {
      onSizeChange: vi.fn(),
      onBrightnessChange: vi.fn(),
      onDepthFadeChange: vi.fn(),
      onHighlightFallbackChange: vi.fn(),
      onRealOnlyChange: vi.fn(),
    };
    const tonemap = {
      onExposureChange: vi.fn(),
      onCurveChange: vi.fn(),
    };
    const camera = { onAutoRotateChange: vi.fn() };
    const thumbnails = { onEnabledChange: vi.fn() };
    const milkyWay = { onEnabledChange: vi.fn() };
    const debug = {
      onShowPickBufferChange: vi.fn(),
      onShowDiskRadiusRingChange: vi.fn(),
    };
    const bias = {
      onModeChange: vi.fn(),
      onAbsMagLimitChange: vi.fn(),
    };
    const sources = { onMaskChange: vi.fn() };
    const labels = {
      onLabelCategoryVisibilityChange: vi.fn(),
      onMarkerCategoryVisibilityChange: vi.fn(),
    };

    const cb: EngineCallbacks = {
      ...makeRequiredCallbacks(),
      surveys,
      tonemap,
      camera,
      thumbnails,
      milkyWay,
      debug,
      bias,
      sources,
      labels,
    };

    seedSettingsCallbacks(cb, makeSnapshot());

    // Every echo migrated to the engine-owned store (React reads each cluster
    // via `useSettingsStore` selectors, seeded from the same defaults), so the
    // seed rings nothing. The labels cluster was the last holdout; its
    // per-category marker + label records are now projected on read.
    for (const spy of [
      surveys.onSizeChange,
      surveys.onBrightnessChange,
      surveys.onDepthFadeChange,
      surveys.onHighlightFallbackChange,
      surveys.onRealOnlyChange,
      tonemap.onExposureChange,
      tonemap.onCurveChange,
      camera.onAutoRotateChange,
      thumbnails.onEnabledChange,
      milkyWay.onEnabledChange,
      debug.onShowPickBufferChange,
      debug.onShowDiskRadiusRingChange,
      bias.onModeChange,
      bias.onAbsMagLimitChange,
      sources.onMaskChange,
      labels.onLabelCategoryVisibilityChange,
      labels.onMarkerCategoryVisibilityChange,
    ]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('does not fire required callbacks (status/hover/select) — those have separate lifecycles', () => {
    const cb = makeRequiredCallbacks();

    seedSettingsCallbacks(cb, makeSnapshot());

    expect(cb.lifecycle.onStatusChange).not.toHaveBeenCalled();
    expect(cb.selection.onHoverChange).not.toHaveBeenCalled();
    expect(cb.selection.onSelectChange).not.toHaveBeenCalled();
  });

  it('silently no-ops when optional callbacks are undefined', () => {
    const cb: EngineCallbacks = makeRequiredCallbacks();
    // Call should not throw — the husk touches no callback.
    expect(() => seedSettingsCallbacks(cb, makeSnapshot())).not.toThrow();
  });
});
