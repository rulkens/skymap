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
  setGalaxyCatalogSize,
  setBrightness,
  setDepthFade,
  setHighlightFallback,
  setRealOnly,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setExposure,
  setToneMapCurve,
  setBiasMode,
  setAbsMagLimit,
  setThumbnailsEnabled,
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setFilamentsEnabled,
  setFilamentIntensity,
  setVolumesEnabled,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
  setFlowEnabled,
  setFlow,
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setPassDisabled,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathSpline,
  setClipPathLookAhead,
  setClipPathPassByOffset,
  setClipPathTuningActive,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  setLabelsEnabled,
  mergeSnapshot,
} from '../../../src/state/settings/settingsSlice';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS, isStructureId } from '../../../src/data/structure/structureIds';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import type { VolumeFieldId } from '../../../src/@types/data/volume/VolumeFieldId';
import type { SettingsSnapshot } from '../../../src/@types/engine/settings/SettingsSnapshot';

const base = () => buildInitialSettings();

// A real galaxy-catalog / structure id from the registry-derived arrays.
// These arrays are always non-empty, so the non-null assertion is safe.
const catalogId = GALAXY_CATALOG_IDS[0]!;
const structureId = STRUCTURE_IDS[0]!;

// A seeded volume id (the construction seed records every shippable volume).
const seededVolumeId = Object.keys(base().volumes.items)[0] as VolumeFieldId;

describe('settingsSlice — galaxy-catalog knobs', () => {
  it('setGalaxyCatalogSize updates galaxyCatalogs.sizePx', () => {
    expect(reducer(base(), setGalaxyCatalogSize(7.5)).galaxyCatalogs.sizePx).toBe(7.5);
  });
  it('setBrightness updates galaxyCatalogs.brightness', () => {
    expect(reducer(base(), setBrightness(0.5)).galaxyCatalogs.brightness).toBe(0.5);
  });
  it('setDepthFade updates galaxyCatalogs.depthFade', () => {
    const before = base();
    expect(
      reducer(before, setDepthFade(!before.galaxyCatalogs.depthFade)).galaxyCatalogs.depthFade,
    ).toBe(!before.galaxyCatalogs.depthFade);
  });
  it('setHighlightFallback updates galaxyCatalogs.highlightFallback', () => {
    const before = base();
    expect(
      reducer(before, setHighlightFallback(!before.galaxyCatalogs.highlightFallback)).galaxyCatalogs
        .highlightFallback,
    ).toBe(!before.galaxyCatalogs.highlightFallback);
  });
  it('setRealOnly updates galaxyCatalogs.realOnly', () => {
    const before = base();
    expect(
      reducer(before, setRealOnly(!before.galaxyCatalogs.realOnly)).galaxyCatalogs.realOnly,
    ).toBe(!before.galaxyCatalogs.realOnly);
  });
  it('setGalaxyCatalogVisible flips one item row', () => {
    const next = reducer(base(), setGalaxyCatalogVisible({ id: catalogId, enabled: false }));
    expect(next.galaxyCatalogs.items[catalogId].enabled).toBe(false);
  });
  it('setGalaxyCatalogLabelEnabled flips one item label', () => {
    const next = reducer(base(), setGalaxyCatalogLabelEnabled({ id: catalogId, enabled: false }));
    expect(next.galaxyCatalogs.items[catalogId].labelEnabled).toBe(false);
  });
});

describe('settingsSlice — tonemap / bias', () => {
  it('setExposure updates tonemap.exposure', () => {
    expect(reducer(base(), setExposure(2.5)).tonemap.exposure).toBe(2.5);
  });
  it('setToneMapCurve updates tonemap.curve', () => {
    expect(reducer(base(), setToneMapCurve(3)).tonemap.curve).toBe(3);
  });
  it('setBiasMode updates bias.mode', () => {
    expect(reducer(base(), setBiasMode(2)).bias.mode).toBe(2);
  });
  it('setAbsMagLimit updates bias.absMagLimit', () => {
    expect(reducer(base(), setAbsMagLimit(-20.5)).bias.absMagLimit).toBe(-20.5);
  });
});

describe('settingsSlice — overlay layers', () => {
  it('setThumbnailsEnabled updates thumbnails.enabled', () => {
    const before = base();
    expect(
      reducer(before, setThumbnailsEnabled(!before.thumbnails.enabled)).thumbnails.enabled,
    ).toBe(!before.thumbnails.enabled);
  });
  it('setMilkyWayEnabled updates milkyWay.enabled', () => {
    const before = base();
    expect(reducer(before, setMilkyWayEnabled(!before.milkyWay.enabled)).milkyWay.enabled).toBe(
      !before.milkyWay.enabled,
    );
  });
  it('setMilkyWayLabelEnabled updates milkyWay.labelEnabled', () => {
    const before = base();
    expect(
      reducer(before, setMilkyWayLabelEnabled(!before.milkyWay.labelEnabled)).milkyWay.labelEnabled,
    ).toBe(!before.milkyWay.labelEnabled);
  });
  it('setFilamentsEnabled updates filaments.enabled', () => {
    const before = base();
    expect(reducer(before, setFilamentsEnabled(!before.filaments.enabled)).filaments.enabled).toBe(
      !before.filaments.enabled,
    );
  });
  it('setFilamentIntensity updates filaments.intensity', () => {
    expect(reducer(base(), setFilamentIntensity(0.42)).filaments.intensity).toBe(0.42);
  });
  it('setVolumesEnabled updates volumes.enabled', () => {
    const before = base();
    expect(reducer(before, setVolumesEnabled(!before.volumes.enabled)).volumes.enabled).toBe(
      !before.volumes.enabled,
    );
  });
});

describe('settingsSlice — structures', () => {
  it('setStructureItemEnabled flips one item row', () => {
    const next = reducer(base(), setStructureItemEnabled({ id: structureId, enabled: false }));
    expect(next.structures.items[structureId].enabled).toBe(false);
  });
  it('setStructureLabelEnabled flips one item label', () => {
    const next = reducer(base(), setStructureLabelEnabled({ id: structureId, enabled: false }));
    expect(next.structures.items[structureId].labelEnabled).toBe(false);
  });
});

describe('settingsSlice — debug', () => {
  it('setShowPickBuffer updates debug.showPickBuffer', () => {
    const before = base();
    expect(
      reducer(before, setShowPickBuffer(!before.debug.showPickBuffer)).debug.showPickBuffer,
    ).toBe(!before.debug.showPickBuffer);
  });
  it('setShowDiskRadiusRing updates debug.showDiskRadiusRing', () => {
    const before = base();
    expect(
      reducer(before, setShowDiskRadiusRing(!before.debug.showDiskRadiusRing)).debug
        .showDiskRadiusRing,
    ).toBe(!before.debug.showDiskRadiusRing);
  });
  it('setPassDisabled writes a plain-object record entry', () => {
    const enabled = reducer(base(), setPassDisabled({ pass: 'foo', disabled: true }));
    expect(enabled.debug.disabledPasses).toEqual({ foo: true });

    const flipped = reducer(enabled, setPassDisabled({ pass: 'foo', disabled: false }));
    expect(flipped.debug.disabledPasses).toEqual({ foo: false });
  });

  it('clip-path tuning starts every override inactive', () => {
    expect(base().debug.clipPathInspect.active).toEqual({
      align: false,
      rampSec: false,
      linger: false,
      spline: false,
      passBy: false,
    });
  });

  it('setting a tuning value activates that knob (drag-to-activate)', () => {
    const next = reducer(base(), setClipPathLinger(0.8));
    expect(next.debug.clipPathInspect.linger).toBe(0.8);
    expect(next.debug.clipPathInspect.active.linger).toBe(true);
    // Other knobs stay inactive.
    expect(next.debug.clipPathInspect.active.align).toBe(false);
    expect(next.debug.clipPathInspect.active.spline).toBe(false);
  });

  it('setClipPathLingerSec sets the window and rides the one linger override', () => {
    // lingerSec is a dwell sub-knob with no gate of its own — it rides the single
    // `linger` override, so touching it activates `linger`.
    const next = reducer(base(), setClipPathLingerSec(3.5));
    expect(next.debug.clipPathInspect.lingerSec).toBe(3.5);
    expect(next.debug.clipPathInspect.active.linger).toBe(true);
  });

  it('setClipPathSpline activates the spline override', () => {
    const next = reducer(base(), setClipPathSpline('causalHermite'));
    expect(next.debug.clipPathInspect.spline).toBe('causalHermite');
    expect(next.debug.clipPathInspect.active.spline).toBe(true);
  });

  it('setClipPathLookAhead sets the value and activates the one spline override', () => {
    // lookAhead is a causal-only sub-knob with no gate of its own — it rides the
    // single `spline` override, so touching it activates `spline`.
    const next = reducer(base(), setClipPathLookAhead(1.5));
    expect(next.debug.clipPathInspect.lookAhead).toBe(1.5);
    expect(next.debug.clipPathInspect.active.spline).toBe(true);
  });

  it('setClipPathPassByOffset activates the passBy override', () => {
    const next = reducer(base(), setClipPathPassByOffset(4));
    expect(next.debug.clipPathInspect.passByOffset).toBe(4);
    expect(next.debug.clipPathInspect.active.passBy).toBe(true);
  });

  it('setClipPathTuningActive toggles a knob without touching its value', () => {
    const activated = reducer(base(), setClipPathTuningActive({ knob: 'align', active: true }));
    expect(activated.debug.clipPathInspect.active.align).toBe(true);
    expect(activated.debug.clipPathInspect.align).toBe(base().debug.clipPathInspect.align);

    const off = reducer(activated, setClipPathTuningActive({ knob: 'align', active: false }));
    expect(off.debug.clipPathInspect.active.align).toBe(false);
  });
});

describe('settingsSlice — volume fields', () => {
  it('addVolumeField preserves an existing (tuned) row', () => {
    const tuned = reducer(
      base(),
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.123 } }),
    );
    expect(tuned.volumes.items[seededVolumeId]?.intensity).toBe(0.123);

    // Re-registering the seeded id is an identity no-op — sliders survive.
    const readded = reducer(tuned, addVolumeField(seededVolumeId));
    expect(readded.volumes.items[seededVolumeId]).toEqual(tuned.volumes.items[seededVolumeId]);
    expect(readded.volumes.items[seededVolumeId]?.intensity).toBe(0.123);
  });

  it('removeVolumeField deletes the row', () => {
    const next = reducer(base(), removeVolumeField(seededVolumeId));
    expect(next.volumes.items[seededVolumeId]).toBeUndefined();
  });

  it('writeVolumeField patches a row; unknown id is a no-op', () => {
    const patched = reducer(
      base(),
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.77 } }),
    );
    expect(patched.volumes.items[seededVolumeId]?.intensity).toBe(0.77);

    const before = base();
    const after = reducer(
      before,
      writeVolumeField({ id: 'no-such-volume' as VolumeFieldId, patch: { intensity: 1 } }),
    );
    expect(after.volumes.items).toEqual(before.volumes.items);
  });
});

describe('settingsSlice — flow', () => {
  it('setFlowEnabled updates flow.enabled', () => {
    const before = base();
    expect(reducer(before, setFlowEnabled(!before.flow.enabled)).flow.enabled).toBe(
      !before.flow.enabled,
    );
  });
  it('setFlow partial-merges leaf-by-leaf', () => {
    const before = base();
    const next = reducer(before, setFlow({ flowSpeed: 9.5 }));
    expect(next.flow.flowSpeed).toBe(9.5);
    // An untouched leaf is preserved.
    expect(next.flow.count).toBe(before.flow.count);
  });
});

describe('settingsSlice — mergeSnapshot', () => {
  it('replaces only the clusters the patch carries', () => {
    const before = base();
    const next = reducer(
      before,
      mergeSnapshot({
        galaxyCatalogs: { ...before.galaxyCatalogs, brightness: 0.99 },
      } as Partial<SettingsSnapshot>),
    );
    expect(next.galaxyCatalogs.brightness).toBe(0.99);
  });

  it('keeps untouched clusters at their original reference', () => {
    const before = base();
    const next = reducer(
      before,
      mergeSnapshot({
        galaxyCatalogs: { ...before.galaxyCatalogs, brightness: 0.99 },
      } as Partial<SettingsSnapshot>),
    );
    expect(next.bias).toBe(before.bias);
    expect(next.tonemap).toBe(before.tonemap);
  });

  it('detaches the result from the patch object', () => {
    const before = base();
    const patch = {
      galaxyCatalogs: { ...before.galaxyCatalogs, brightness: 0.5 },
    } as Partial<SettingsSnapshot>;
    const next = reducer(before, mergeSnapshot(patch));
    // Mutating the patch after dispatch must not bleed into state.
    (patch.galaxyCatalogs as { brightness: number }).brightness = 999;
    expect(next.galaxyCatalogs.brightness).toBe(0.5);
  });
});

describe('settingsSlice — setLabelsEnabled (master label fan-out)', () => {
  // The master routes every label-bearing category to its authoritative home:
  // structure ids → structures.items, milkyWay → milkyWay scalar, else (famous)
  // → galaxyCatalogs.items. LABEL_CATEGORIES is exactly the label-bearing set.
  const labelOf = (state: ReturnType<typeof base>, cat: (typeof LABEL_CATEGORIES)[number]) =>
    isStructureId(cat)
      ? state.structures.items[cat].labelEnabled
      : cat === 'milkyWay'
        ? state.milkyWay.labelEnabled
        : state.galaxyCatalogs.items[cat].labelEnabled;

  it('disables labels across every label-bearing category', () => {
    const next = reducer(base(), setLabelsEnabled(false));
    for (const cat of LABEL_CATEGORIES) expect(labelOf(next, cat)).toBe(false);
  });

  it('re-enables labels across every label-bearing category', () => {
    const on = reducer(reducer(base(), setLabelsEnabled(false)), setLabelsEnabled(true));
    for (const cat of LABEL_CATEGORIES) expect(labelOf(on, cat)).toBe(true);
  });
});

describe('settingsSlice — Immer structural sharing', () => {
  it('swaps the touched cluster reference and shares the rest', () => {
    // A no-op action leaves the state object identical, giving a clean baseline.
    const beforeState = reducer(base(), { type: 'noop' });
    const after = reducer(beforeState, setBrightness(9));
    // Touched cluster is a new reference; sibling clusters are shared.
    expect(after.galaxyCatalogs).not.toBe(beforeState.galaxyCatalogs);
    expect(after.tonemap).toBe(beforeState.tonemap);
  });
});
