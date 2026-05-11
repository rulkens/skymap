/**
 * settingsTable — unit tests for the table-driven settings setter builder.
 *
 * The 13 "boring" public-handle setters on `EngineHandle`
 * (`setPointSize`, `setBrightness`, …) all share the same shape:
 *
 *   1. Mutate one field on `state.settings.*` (or `state.bias.*`).
 *   2. Optionally fire an echo callback with the (post-clamp) value.
 *   3. Call `requestRender()` so the next frame picks up the change.
 *
 * `buildSettersFromTable` reifies that shape as a declarative descriptor
 * table and emits the 13 setters from one builder.  These tests exercise
 * the contract directly without spinning up the full engine, which keeps
 * the suite cheap and pinpoints regressions to the table itself when
 * something breaks.
 *
 * What we cover here:
 *   - happy-path: mutation + callback + render-request all fire in the
 *     right order with the right value;
 *   - clamps: when a descriptor declares a clamp, the *clamped* value
 *     lands in state AND in the echo callback (mirrors the engine's
 *     `setExposure` shape);
 *   - missing-callback tolerance: descriptors without a `callback` key
 *     (or with the slot left undefined on the EngineCallbacks bag) skip
 *     the echo silently — same optional-chaining shape every other
 *     setter uses.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  buildSettersFromTable,
  SETTINGS_TABLE,
} from '../../../../src/services/engine/wiring/settingsTable';
import type { EngineCallbacks, EngineState } from '../../../../src/@types';
import { BiasMode } from '../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';

/**
 * Build a deeply-mutable test fixture for the engine state slices the
 * table touches.  We keep the rest of `EngineState` as `{} as never`
 * style stubs because the builder only ever follows `path` tuples that
 * end inside `state.settings` or `state.bias`.
 */
function makeState(): Pick<EngineState, 'settings' | 'bias'> {
  return {
    settings: {
      pointSizePx: 2.5,
      brightness: 1.0,
      autoRotate: false,
      galaxyTexturesEnabled: true,
      milkyWayEnabled: true,
      filamentsEnabled: false,
      filamentIntensity: 0.5,
      volumesEnabled: false,
      volumeFields: {},
      highlightFallback: true,
      realOnlyMode: false,
      depthFadeEnabled: true,
      exposure: 1.0,
      toneMapCurve: ToneMapCurve.Reinhard,
      // Nested sub-bag mirror (Task 2 of H5 namespace restructure).
      // Same values as the flat fields above.  The settingsTable
      // builder still reads/writes the flat shape in this commit;
      // Task 5 will dual-write to both.
      points: {
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: true,
        realOnly: false,
      },
      tonemap: { exposure: 1.0, curve: ToneMapCurve.Reinhard },
      camera: { autoRotate: false },
      bias: { mode: BiasMode.None, absMagLimit: -19 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 0.5 },
      volumes: { masterEnabled: false, fields: {} },
    },
    bias: {
      mode: BiasMode.None,
      absMagLimit: -19,
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
  };
}

describe('settingsTable', () => {
  describe('SETTINGS_TABLE', () => {
    it('declares the 13 table-candidate setters', () => {
      // The plan freezes this list at 13 — bespoke setters
      // (`setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`,
      // `setSpaceMouseSensitivity`) MUST stay inline in engine.ts.
      // If this number drifts, either a new boring setter snuck in
      // (good — extend the table) or a bespoke one was accidentally
      // tabled (bad — bespoke logic gets dropped silently).
      const names = SETTINGS_TABLE.map((d) => d.name).sort();
      expect(names).toEqual(
        [
          'setAbsMagLimit',
          'setAutoRotate',
          'setBrightness',
          'setDepthFadeEnabled',
          'setExposure',
          'setFilamentIntensity',
          'setFilamentsEnabled',
          'setGalaxyTexturesEnabled',
          'setHighlightFallback',
          'setMilkyWayEnabled',
          'setPointSize',
          'setRealOnlyMode',
          'setToneMapCurve',
        ].sort(),
      );
    });
  });

  describe('buildSettersFromTable', () => {
    it('mutates state, fires the echo callback, and requests a render', () => {
      const state = makeState();
      const cb: Partial<EngineCallbacks> = {
        onPointSizeChange: vi.fn(),
        onBrightnessChange: vi.fn(),
      };
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
      );

      setters.setPointSize(4.2);
      expect(state.settings.pointSizePx).toBe(4.2);
      expect(cb.onPointSizeChange).toHaveBeenCalledExactlyOnceWith(4.2);
      expect(requestRender).toHaveBeenCalledOnce();

      setters.setBrightness(2.0);
      expect(state.settings.brightness).toBe(2.0);
      expect(cb.onBrightnessChange).toHaveBeenCalledExactlyOnceWith(2.0);
      expect(requestRender).toHaveBeenCalledTimes(2);
    });

    it('applies clamps before mutation and callback echo', () => {
      // setExposure clamps to [0.05, 16] and echoes the clamped value;
      // setFilamentIntensity clamps to [0, 1] but has no callback.
      const state = makeState();
      const cb: Partial<EngineCallbacks> = {
        onExposureChange: vi.fn(),
      };
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
      );

      // Above the cap.
      setters.setExposure(1e9);
      expect(state.settings.exposure).toBe(16);
      expect(cb.onExposureChange).toHaveBeenLastCalledWith(16);

      // Below the floor.
      setters.setExposure(-1);
      expect(state.settings.exposure).toBe(0.05);
      expect(cb.onExposureChange).toHaveBeenLastCalledWith(0.05);

      // Filament intensity clamps without an echo callback.
      setters.setFilamentIntensity(2);
      expect(state.settings.filamentIntensity).toBe(1);
      setters.setFilamentIntensity(-3);
      expect(state.settings.filamentIntensity).toBe(0);
    });

    it('tolerates a missing echo callback (optional-chaining contract)', () => {
      // setFilamentsEnabled has no `callback` key in its descriptor
      // (App.tsx owns that boolean optimistically).  Even more broadly:
      // any descriptor whose declared callback is left `undefined` on
      // the EngineCallbacks bag must not throw — same shape as the
      // hand-rolled setters' `cb.onXChange?.(v)`.
      const state = makeState();
      const cb: Partial<EngineCallbacks> = {}; // every callback undefined
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
      );

      expect(() => setters.setFilamentsEnabled(true)).not.toThrow();
      expect(state.settings.filamentsEnabled).toBe(true);
      expect(requestRender).toHaveBeenCalledOnce();

      // Same tolerance for setters whose callback is "declared" via the
      // descriptor but happens to be undefined on the cb bag.
      expect(() => setters.setBrightness(0.7)).not.toThrow();
      expect(state.settings.brightness).toBe(0.7);
      expect(requestRender).toHaveBeenCalledTimes(2);
    });
  });
});
