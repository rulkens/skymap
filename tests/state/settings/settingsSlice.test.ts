/**
 * settingsSlice — unit tests for the inline-Immer RTK settings slice.
 *
 * Each test calls the slice reducer directly with an action creator's output
 * (`reducer(state, actionCreator(payload))`) and asserts the single field the
 * reducer writes. Beyond the per-action field coverage, the suite pins the two
 * structural guarantees Immer gives us in place of the old hand-written
 * copy-on-write spreads: the touched cluster gets a NEW reference (selectors
 * re-run) while untouched clusters keep their reference (selectors skip), and
 * `mergeSnapshot` returns a detached, partially-replaced state.
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  setBrightness,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
  setFlow,
  setStarCatalogVisible,
  setDebugOverlay,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathLookAhead,
  setClipPathTuningActive,
  settingsSlice,
  CORE_REDUCERS,
} from '../../../src/state/settings/settingsSlice';
import { APP_SETTINGS_FRAGMENTS } from '../../../src/compositions/appSettingsFragments';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import type { VolumeFieldId } from '../../../src/@types/data/volume/VolumeFieldId';

// A seeded volume id (the boot value records every shippable volume).
const seededVolumeId = Object.keys(INITIAL_SETTINGS.volumes.items)[0] as VolumeFieldId;

describe('settingsSlice — debug', () => {
  it('setDebugOverlay flips exactly the targeted row (Immer in-place, not a record swap)', () => {
    const next = reducer(INITIAL_SETTINGS, setDebugOverlay({ key: 'pick-buffer', enabled: true }));
    expect(next.debug.overlays['pick-buffer']).toBe(true);
    expect(next.debug.overlays['disk-radius-ring']).toBe(false);
    expect(next.debug.overlays['orbit-trail-impostor']).toBe(false);
  });

  it('setting a tuning value activates that knob (drag-to-activate)', () => {
    const next = reducer(INITIAL_SETTINGS, setClipPathLinger(0.8));
    expect(next.debug.clipPathInspect.linger).toBe(0.8);
    expect(next.debug.clipPathInspect.active.linger).toBe(true);
    // Other knobs stay inactive.
    expect(next.debug.clipPathInspect.active.align).toBe(false);
    expect(next.debug.clipPathInspect.active.spline).toBe(false);
  });

  it('setClipPathLingerSec sets the window and rides the one linger override', () => {
    // lingerSec is a dwell sub-knob with no gate of its own — it rides the single
    // `linger` override, so touching it activates `linger`.
    const next = reducer(INITIAL_SETTINGS, setClipPathLingerSec(3.5));
    expect(next.debug.clipPathInspect.lingerSec).toBe(3.5);
    expect(next.debug.clipPathInspect.active.linger).toBe(true);
  });

  it('setClipPathLookAhead sets the value and activates the one spline override', () => {
    // lookAhead is a causal-only sub-knob with no gate of its own — it rides the
    // single `spline` override, so touching it activates `spline`.
    const next = reducer(INITIAL_SETTINGS, setClipPathLookAhead(1.5));
    expect(next.debug.clipPathInspect.lookAhead).toBe(1.5);
    expect(next.debug.clipPathInspect.active.spline).toBe(true);
  });

  it('setClipPathTuningActive toggles a knob without touching its value', () => {
    const activated = reducer(
      INITIAL_SETTINGS,
      setClipPathTuningActive({ knob: 'align', active: true }),
    );
    expect(activated.debug.clipPathInspect.active.align).toBe(true);
    expect(activated.debug.clipPathInspect.align).toBe(
      INITIAL_SETTINGS.debug.clipPathInspect.align,
    );

    const off = reducer(activated, setClipPathTuningActive({ knob: 'align', active: false }));
    expect(off.debug.clipPathInspect.active.align).toBe(false);
  });
});

describe('settingsSlice — volume fields', () => {
  it('addVolumeField preserves an existing (tuned) row', () => {
    const tuned = reducer(
      INITIAL_SETTINGS,
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.123 } }),
    );
    expect(tuned.volumes.items[seededVolumeId]?.intensity).toBe(0.123);

    // Re-registering the seeded id is an identity no-op — sliders survive.
    const readded = reducer(tuned, addVolumeField(seededVolumeId));
    expect(readded.volumes.items[seededVolumeId]).toEqual(tuned.volumes.items[seededVolumeId]);
    expect(readded.volumes.items[seededVolumeId]?.intensity).toBe(0.123);
  });

  it('removeVolumeField deletes the row', () => {
    const next = reducer(INITIAL_SETTINGS, removeVolumeField(seededVolumeId));
    expect(next.volumes.items[seededVolumeId]).toBeUndefined();
  });

  it('writeVolumeField patches a row; unknown id is a no-op', () => {
    const patched = reducer(
      INITIAL_SETTINGS,
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.77 } }),
    );
    expect(patched.volumes.items[seededVolumeId]?.intensity).toBe(0.77);

    const before = INITIAL_SETTINGS;
    const after = reducer(
      before,
      writeVolumeField({ id: 'no-such-volume' as VolumeFieldId, patch: { intensity: 1 } }),
    );
    expect(after.volumes.items).toEqual(before.volumes.items);
  });
});

describe('settingsSlice — flow', () => {
  it('setFlow partial-merges leaf-by-leaf', () => {
    const before = INITIAL_SETTINGS;
    const next = reducer(before, setFlow({ flowSpeed: 9.5 }));
    expect(next.flow.flowSpeed).toBe(9.5);
    // An untouched leaf is preserved.
    expect(next.flow.count).toBe(before.flow.count);
  });
});

describe('settingsSlice — star catalogs', () => {
  it('setStarCatalogVisible toggles a catalog’s enabled', () => {
    // gaiaStars seeds enabled: true from SOURCE_REGISTRY[Source.GaiaStars].visible;
    // the per-item reducer flips one row without touching the master gate.
    const next = reducer(
      INITIAL_SETTINGS,
      setStarCatalogVisible({ id: 'gaiaStars', enabled: false }),
    );
    expect(next.starCatalogs.items.gaiaStars.enabled).toBe(false);
    expect(next.starCatalogs.enabled).toBe(true);
  });
});

describe('settingsSlice — composed action namespace', () => {
  it('mints exactly the core reducers plus every listed fragment’s', () => {
    // Two independently derived key sets: the core reducer map and the fragment
    // tuple. Comparing their union to the slice catches a fragment listed but
    // never spread into `reducers`, and one spread in but missing from the tuple.
    expect(Object.keys(settingsSlice.actions).sort()).toEqual(
      [
        ...Object.keys(CORE_REDUCERS),
        ...APP_SETTINGS_FRAGMENTS.flatMap((fragment) => Object.keys(fragment.reducers)),
      ].sort(),
    );
  });
});

describe('settingsSlice — Immer structural sharing', () => {
  it('swaps the touched cluster reference and shares the rest', () => {
    // A no-op action leaves the state object identical, giving a clean baseline.
    const beforeState = reducer(INITIAL_SETTINGS, { type: 'noop' });
    const after = reducer(beforeState, setBrightness(9));
    // Touched cluster is a new reference; sibling clusters are shared.
    expect(after.galaxyCatalogs).not.toBe(beforeState.galaxyCatalogs);
    expect(after.tonemap).toBe(beforeState.tonemap);
  });
});
