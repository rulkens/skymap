/**
 * seedSettingsCallbacks — unit tests for the settings-callback fan-out.
 *
 * The helper is a pure dispatch with no engine state, so we can exercise
 * it with a stub `EngineCallbacks` populated with vi.fn() spies and
 * assert per-callback call count + argument.  We also verify the
 * optional-chaining behaviour: callbacks left undefined are silently
 * skipped (i.e. no exception, no call).
 */

import { describe, it, expect, vi } from 'vitest';

import {
  seedSettingsCallbacks,
  type Snapshot,
} from '../../../src/services/engine/seedSettingsCallbacks';
import type { EngineCallbacks } from '../../../src/@types';
import { BiasMode } from '../../../src/data/biasMode';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';

function makeSnapshot(): Snapshot {
  return {
    pointSize: 2.5,
    brightness: 1.0,
    autoRotate: false,
    galaxyTexturesEnabled: true,
    highlightFallback: true,
    realOnlyMode: false,
    depthFadeEnabled: true,
    biasMode: BiasMode.None,
    absMagLimit: -19.5,
    toneMapCurve: ToneMapCurve.Reinhard,
    exposure: 1.2,
    lodMode: 'auto',
    visibleSourceMask: 0b111,
  };
}

function makeRequiredCallbacks() {
  // The four required callbacks aren't fired by the helper, but the
  // EngineCallbacks type requires them — fill with no-op spies.
  return {
    onStatusChange: vi.fn(),
    onHoverChange: vi.fn(),
    onSelectChange: vi.fn(),
    onScaleChange: vi.fn(),
  };
}

describe('seedSettingsCallbacks', () => {
  it('fires every optional callback exactly once with its snapshot value', () => {
    const snap = makeSnapshot();
    const cb: EngineCallbacks = {
      ...makeRequiredCallbacks(),
      onPointSizeChange: vi.fn(),
      onBrightnessChange: vi.fn(),
      onAutoRotateChange: vi.fn(),
      onGalaxyTexturesEnabledChange: vi.fn(),
      onHighlightFallbackChange: vi.fn(),
      onRealOnlyModeChange: vi.fn(),
      onDepthFadeEnabledChange: vi.fn(),
      onBiasModeChange: vi.fn(),
      onAbsMagLimitChange: vi.fn(),
      onToneMapCurveChange: vi.fn(),
      onExposureChange: vi.fn(),
      onLodModeChange: vi.fn(),
      onSourceMaskChange: vi.fn(),
    };

    seedSettingsCallbacks(cb, snap);

    expect(cb.onPointSizeChange).toHaveBeenCalledExactlyOnceWith(snap.pointSize);
    expect(cb.onBrightnessChange).toHaveBeenCalledExactlyOnceWith(snap.brightness);
    expect(cb.onAutoRotateChange).toHaveBeenCalledExactlyOnceWith(snap.autoRotate);
    expect(cb.onGalaxyTexturesEnabledChange).toHaveBeenCalledExactlyOnceWith(
      snap.galaxyTexturesEnabled,
    );
    expect(cb.onHighlightFallbackChange).toHaveBeenCalledExactlyOnceWith(
      snap.highlightFallback,
    );
    expect(cb.onRealOnlyModeChange).toHaveBeenCalledExactlyOnceWith(snap.realOnlyMode);
    expect(cb.onDepthFadeEnabledChange).toHaveBeenCalledExactlyOnceWith(
      snap.depthFadeEnabled,
    );
    expect(cb.onBiasModeChange).toHaveBeenCalledExactlyOnceWith(snap.biasMode);
    expect(cb.onAbsMagLimitChange).toHaveBeenCalledExactlyOnceWith(snap.absMagLimit);
    expect(cb.onToneMapCurveChange).toHaveBeenCalledExactlyOnceWith(snap.toneMapCurve);
    expect(cb.onExposureChange).toHaveBeenCalledExactlyOnceWith(snap.exposure);
    expect(cb.onLodModeChange).toHaveBeenCalledExactlyOnceWith(snap.lodMode);
    expect(cb.onSourceMaskChange).toHaveBeenCalledExactlyOnceWith(snap.visibleSourceMask);
  });

  it('does not fire required callbacks (status/hover/select/scale) — those have separate lifecycles', () => {
    const required = makeRequiredCallbacks();
    const cb: EngineCallbacks = required;

    seedSettingsCallbacks(cb, makeSnapshot());

    expect(required.onStatusChange).not.toHaveBeenCalled();
    expect(required.onHoverChange).not.toHaveBeenCalled();
    expect(required.onSelectChange).not.toHaveBeenCalled();
    expect(required.onScaleChange).not.toHaveBeenCalled();
  });

  it('silently no-ops when optional callbacks are undefined', () => {
    const cb: EngineCallbacks = makeRequiredCallbacks();
    // Call should not throw — optional-chaining covers the undefined case.
    expect(() => seedSettingsCallbacks(cb, makeSnapshot())).not.toThrow();
  });

  it('skips undefined callbacks individually without affecting siblings', () => {
    // Mix: one optional callback present, the rest undefined.  Verifies
    // the present one fires while the absent ones don't throw.
    const onExposureChange = vi.fn();
    const cb: EngineCallbacks = {
      ...makeRequiredCallbacks(),
      onExposureChange,
    };

    seedSettingsCallbacks(cb, makeSnapshot());

    expect(onExposureChange).toHaveBeenCalledExactlyOnceWith(1.2);
  });
});
