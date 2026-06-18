/**
 * settingsTable — unit tests for the table-driven settings setter builder.
 *
 * The "boring" public-handle setters on `EngineHandle` (`setPointSize`,
 * `setBrightness`, …) all share the same shape:
 *
 *   1. Dispatch one cluster's copy-on-write store action.
 *   2. Call `requestRender()` so the next frame picks up the change.
 *
 * `buildSettersFromTable` reifies that shape as a declarative descriptor
 * table and emits the setters from one builder.  These tests exercise the
 * contract directly without spinning up the full engine, which keeps the
 * suite cheap and pinpoints regressions to the table itself when something
 * breaks.
 *
 * What we cover here:
 *   - happy-path: the store write + render-request fire with the right value;
 *   - raw intent: no table row clamps — out-of-range values land in the store
 *     unchanged; clamping lives at each renderer's point of use.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  buildSettersFromTable,
  SETTINGS_TABLE,
} from '../../../../src/services/engine/wiring/settingsTable';
import { createAppStore } from '../../../../src/store/createAppStore';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

describe('settingsTable', () => {
  describe('SETTINGS_TABLE', () => {
    it('declares the 13 table-candidate setters', () => {
      // Bespoke setters MUST stay out of the table: the "dispatch + render"
      // ones (`setBiasMode`, `setTier`, `setSourceVisible`) plus the
      // fade-driving ones (`flow.set`, `milkyWay`/`filaments` visibility) that
      // live as `handles/` functions. If this list drifts, either a new boring
      // setter snuck in
      // (good — extend the table) or a bespoke one was accidentally tabled (bad
      // — bespoke logic gets dropped silently).
      const names = SETTINGS_TABLE.map((d) => d.name).sort();
      expect(names).toEqual(
        [
          'setAbsMagLimit',
          'setAutoRotate',
          'setBrightness',
          'setDepthFadeEnabled',
          'setExposure',
          'setFilamentIntensity',
          'setGalaxyTexturesEnabled',
          'setHighlightFallback',
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
    it('writes a row through the store action and requests a render', () => {
      const { store } = createAppStore({ settings: makeSettingsFixture() });
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(requestRender, store);

      setters.setPointSize(4.2);
      expect(store.getState().settings.galaxyCatalogs.sizePx).toBe(4.2);
      expect(requestRender).toHaveBeenCalledOnce();

      setters.setBrightness(2.0);
      expect(store.getState().settings.galaxyCatalogs.brightness).toBe(2.0);
      expect(requestRender).toHaveBeenCalledTimes(2);
    });

    it('stores raw intent (clamping moved to point of use)', () => {
      // No table row clamps anymore: setExposure's clamp moved to the
      // post-process pass (clampExposure) and setFilamentIntensity's to the
      // filament renderer (clampFilamentIntensity). Out-of-range values pass
      // through unchanged — both dispatch copy-on-write store actions.
      const { store } = createAppStore({ settings: makeSettingsFixture() });
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(requestRender, store);

      setters.setExposure(1e9);
      expect(store.getState().settings.tonemap.exposure).toBe(1e9);
      setters.setExposure(-1);
      expect(store.getState().settings.tonemap.exposure).toBe(-1);

      setters.setFilamentIntensity(5);
      expect(store.getState().settings.filaments.intensity).toBe(5);
      setters.setFilamentIntensity(-1);
      expect(store.getState().settings.filaments.intensity).toBe(-1);
    });
  });
});
