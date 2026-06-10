/**
 * seedSettingsCallbacks — unit tests for the settings-callback fan-out.
 *
 * The helper is a pure dispatch with no engine state, so we can exercise
 * it with a stub `EngineCallbacks` populated with vi.fn() spies and
 * assert per-callback call count + argument.  We also verify the
 * optional-chaining behaviour: callbacks left undefined are silently
 * skipped (i.e. no exception, no call).
 *
 * H5 task 11: every echo lives on its nested sub-bag address now —
 * `cb.surveys?.onSizeChange?.(…)` not `cb.onPointSizeChange?.(…)`.
 * The test fixtures mirror that namespacing so a regression in either
 * the dispatch or the nested name shows up here.
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
    labelCategoryVisibility: {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
      group: true,
    },
    markerCategoryVisibility: {
      cluster: true,
      supercluster: true,
      void: true,
      group: true,
    },
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
  it('fires every optional callback exactly once with its snapshot value', () => {
    const snap = makeSnapshot();
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
    const camera = {
      onAutoRotateChange: vi.fn(),
    };
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
    const sources = {
      onMaskChange: vi.fn(),
    };
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

    seedSettingsCallbacks(cb, snap);

    // The surveys cluster + the derived source mask, and the tonemap cluster
    // (curve / exposure), migrated to the engine-owned store; the seed no longer
    // fires their echoes (React reads them via `useSettingsStore` selectors,
    // seeded from the same defaults).
    expect(surveys.onSizeChange).not.toHaveBeenCalled();
    expect(surveys.onBrightnessChange).not.toHaveBeenCalled();
    expect(surveys.onHighlightFallbackChange).not.toHaveBeenCalled();
    expect(surveys.onRealOnlyChange).not.toHaveBeenCalled();
    expect(surveys.onDepthFadeChange).not.toHaveBeenCalled();
    expect(sources.onMaskChange).not.toHaveBeenCalled();
    expect(tonemap.onCurveChange).not.toHaveBeenCalled();
    expect(tonemap.onExposureChange).not.toHaveBeenCalled();
    // Camera auto-rotate, the bias cluster (mode / absMagLimit), and the
    // galaxy-thumbnail toggle migrated to the engine-owned store too; the seed
    // no longer fires their echoes.
    expect(camera.onAutoRotateChange).not.toHaveBeenCalled();
    expect(bias.onModeChange).not.toHaveBeenCalled();
    expect(bias.onAbsMagLimitChange).not.toHaveBeenCalled();
    expect(thumbnails.onEnabledChange).not.toHaveBeenCalled();
    // The Milky-Way disk toggle migrated to the engine-owned store too; the seed
    // never fired its echo (the toggle has no React consumer), so it stays unrung.
    expect(milkyWay.onEnabledChange).not.toHaveBeenCalled();
    // The debug echoes still seed (no migration) — exercised below as the
    // lone-present echo in the per-callback-skip test.
    expect(debug.onShowPickBufferChange).toHaveBeenCalledExactlyOnceWith(snap.showPickBuffer);
    // Each echo carries a fresh copy of the record, not the literal
    // reference — assert by value so the freshness contract stays
    // load-bearing.  Label and marker visibility are two independent
    // axes (split 2026-05-19, audit Q11); both fire at seed.
    expect(labels.onLabelCategoryVisibilityChange).toHaveBeenCalledExactlyOnceWith(
      snap.labelCategoryVisibility,
    );
    expect(labels.onMarkerCategoryVisibilityChange).toHaveBeenCalledExactlyOnceWith(
      snap.markerCategoryVisibility,
    );
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
    // Call should not throw — optional-chaining covers the undefined case.
    expect(() => seedSettingsCallbacks(cb, makeSnapshot())).not.toThrow();
  });

  it('skips undefined callbacks individually without affecting siblings', () => {
    // Mix: one optional callback present, the rest undefined.  Verifies
    // the present one fires while the absent ones don't throw.  Uses a
    // still-firing settings echo (`debug.onShowPickBufferChange`) — the
    // thumbnail toggle migrated to the store and no longer seeds through an
    // echo.
    const onShowPickBufferChange = vi.fn();
    const cb: EngineCallbacks = {
      ...makeRequiredCallbacks(),
      debug: { onShowPickBufferChange },
    };

    seedSettingsCallbacks(cb, makeSnapshot());

    expect(onShowPickBufferChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
