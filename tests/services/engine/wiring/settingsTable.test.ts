/**
 * settingsTable — unit tests for the table-driven settings setter builder.
 *
 * The 13 "boring" public-handle setters on `EngineHandle`
 * (`setPointSize`, `setBrightness`, …) all share the same shape:
 *
 *   1. Mutate one field on `state.settings.<cluster>.<leaf>`.
 *   2. Optionally fire a nested echo callback with the stored value.
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
 *   - raw intent: no table row clamps — out-of-range values land in state
 *     (and echo) unchanged; clamping lives at each renderer's point of use;
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
import { createSettingsStore } from '../../../../src/services/engine/settingsStore/createSettingsStore';
import type { SettingsStore } from '../../../../src/services/engine/settingsStore/createSettingsStore';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { BiasMode } from '../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';

/**
 * Build a deeply-mutable test fixture for the engine state slices the
 * table touches.  We keep the rest of `EngineState` as stubs because the
 * builder only ever follows `path` tuples that end inside
 * `state.settings.<cluster>`.
 */
function makeState(): Pick<EngineState, 'settings' | 'bias'> {
  return {
    settings: {
      surveys: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: true,
        realOnly: false,
        items: {
          synthetic: { enabled: true, labelEnabled: true },
          sdss: { enabled: true, labelEnabled: true },
          '2mrs': { enabled: true, labelEnabled: true },
          glade: { enabled: true, labelEnabled: true },
          famousGalaxy: { enabled: true, labelEnabled: true },
          milliquas: { enabled: true, labelEnabled: true },
        },
      },
      tonemap: { exposure: 1.0, curve: ToneMapCurve.Reinhard },
      camera: { autoRotate: false },
      bias: { mode: BiasMode.None, absMagLimit: -19 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 0.5 },
      volumes: { enabled: false, items: {} },
      flow: {
        enabled: false,
        mode: 'advect',
        intensity: 0.7,
        count: 40000,
        trail: 0.003,
        flowSpeed: 0.06,
        densityBias: 1,
        wander: 0.15,
        boundaryFadeWidth: 0.1,
      },
      debug: { showPickBuffer: false, showDiskRadiusRing: false },
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
    bias: {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
  };
}

/**
 * Seed an engine-owned settings store from the same settings literal.  The
 * migrated surveys rows write through the store (copy-on-write), so their
 * assertions read `store.getState().surveys.*`; the un-migrated rows still
 * mutate `state.settings.*` in place, so those keep reading `state`.
 */
function makeStore(state: Pick<EngineState, 'settings'>): SettingsStore {
  return createSettingsStore(state.settings);
}

describe('settingsTable', () => {
  describe('SETTINGS_TABLE', () => {
    it('declares the 24 table-candidate setters', () => {
      // Bespoke setters (`setBiasMode`, `setTier`, `setSourceVisible`,
      // `setSpaceMouseSensitivity`) MUST stay inline in engine.ts.  If
      // this list drifts, either a new boring setter snuck in (good —
      // extend the table) or a bespoke one was accidentally tabled
      // (bad — bespoke logic gets dropped silently).
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
          'setFlowCount',
          'setFlowDensityBias',
          'setFlowEnabled',
          'setFlowIntensity',
          'setFlowMode',
          'setFlowSpeed',
          'setFlowTrail',
          'setFlowWander',
          'setFlowBoundaryFadeWidth',
          'setGalaxyTexturesEnabled',
          'setHighlightFallback',
          'setMilkyWayEnabled',
          'setPointSize',
          'setRealOnlyMode',
          'setShowDiskRadiusRing',
          'setShowPickBuffer',
          'setToneMapCurve',
        ].sort(),
      );
    });
  });

  describe('buildSettersFromTable', () => {
    it('writes a migrated surveys row through the store action (no echo) and requests a render', () => {
      const state = makeState();
      const store = makeStore(state);
      // The surveys cluster has migrated to the store: `setPointSize` /
      // `setBrightness` dispatch store actions and fire NO echo (React reads
      // via `selectSurveySize` / `selectBrightness`). Any callback wired here
      // must stay untouched.
      const onSizeChange = vi.fn();
      const onBrightnessChange = vi.fn();
      const cb: Partial<EngineCallbacks> = {
        surveys: { onSizeChange, onBrightnessChange },
      };
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
        store,
      );

      setters.setPointSize(4.2);
      // Copy-on-write landed in the store; no echo fired.
      expect(store.getState().surveys.sizePx).toBe(4.2);
      expect(onSizeChange).not.toHaveBeenCalled();
      expect(requestRender).toHaveBeenCalledOnce();

      setters.setBrightness(2.0);
      expect(store.getState().surveys.brightness).toBe(2.0);
      expect(onBrightnessChange).not.toHaveBeenCalled();
      expect(requestRender).toHaveBeenCalledTimes(2);
    });

    it('stores raw intent (clamping moved to point of use)', () => {
      // No table row clamps anymore: setExposure's clamp moved to the
      // post-process pass (clampExposure) and setFilamentIntensity's to the
      // filament renderer (clampFilamentIntensity). Out-of-range values pass
      // through unchanged. `setExposure` has migrated to the store: it dispatches
      // a copy-on-write action (no echo — React reads via `selectExposure`),
      // while `setFilamentIntensity` still mutates `state.settings` in place.
      const state = makeState();
      const store = makeStore(state);
      const onExposureChange = vi.fn();
      const cb: Partial<EngineCallbacks> = {
        tonemap: { onExposureChange },
      };
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
        store,
      );

      // Raw passthrough through the store; no echo fired.
      setters.setExposure(1e9);
      expect(store.getState().tonemap.exposure).toBe(1e9);
      expect(onExposureChange).not.toHaveBeenCalled();

      setters.setExposure(-1);
      expect(store.getState().tonemap.exposure).toBe(-1);
      expect(onExposureChange).not.toHaveBeenCalled();

      // Filament intensity stores raw intent (no clamp, no echo callback);
      // it writes through the store like exposure.
      setters.setFilamentIntensity(5);
      expect(store.getState().filaments.intensity).toBe(5);
      setters.setFilamentIntensity(-1);
      expect(store.getState().filaments.intensity).toBe(-1);
    });

    it('tolerates a missing echo callback (optional-chaining contract)', () => {
      // setFilamentsEnabled has no `callback` key in its descriptor
      // (App.tsx owns that boolean optimistically).  Even more broadly:
      // any descriptor whose declared callback is left `undefined` on
      // the EngineCallbacks bag must not throw — same shape as the
      // hand-rolled setters' `cb.onXChange?.(v)`.
      const state = makeState();
      const store = makeStore(state);
      const cb: Partial<EngineCallbacks> = {}; // every callback undefined
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(
        state as EngineState,
        cb as EngineCallbacks,
        requestRender,
        store,
      );

      expect(() => setters.setFilamentsEnabled(true)).not.toThrow();
      expect(store.getState().filaments.enabled).toBe(true);
      expect(requestRender).toHaveBeenCalledOnce();

      // A migrated surveys row needs no echo at all — it writes through the
      // store action and still wakes the scheduler.
      expect(() => setters.setBrightness(0.7)).not.toThrow();
      expect(store.getState().surveys.brightness).toBe(0.7);
      expect(requestRender).toHaveBeenCalledTimes(2);
    });
  });
});
