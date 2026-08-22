// @vitest-environment jsdom
/**
 * buildInitialSettings — boot-defaults assembly.
 *
 * The reason this literal was pulled out of `createEngine`: its shape can be
 * pinned without standing up the whole engine. These tests assert the contract
 * the runtime relies on at boot — the two registry-DERIVED item records seed
 * exactly one row per id (a drift between the id set and the seed would strand a
 * catalog/structure with no settings row, the bug the `Object.fromEntries`
 * derivation exists to prevent).
 *
 * jsdom (rather than the suite's default `node` environment) so the `?vr`
 * describe block below can drive `buildInitialSettings`'s
 * `window.location.search` read — every other test here runs with an empty
 * search string, the jsdom default, so behaves identically to `window`
 * undefined.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import {
  DEFAULT_FLOW,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_GLOW_OVERLAP,
  DEFAULT_STAR_SIZE_PX,
} from '../../../src/data/defaults';
import { DEFAULT_REFINE_THRESHOLD } from '../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';

describe('buildInitialSettings', () => {
  it('derives one galaxy-catalog item row per id, enabled seeded from registry visible', () => {
    const { items } = buildInitialSettings().galaxyCatalogs;
    expect(Object.keys(items).sort()).toEqual([...GALAXY_CATALOG_IDS].sort());
    // `enabled` is seeded from each source's SOURCE_REGISTRY `visible` field —
    // the registry is the single source of truth for default visibility — while
    // `labelEnabled` is uniformly true. Every galaxy catalog ships visible:true
    // except the DESI patches — DesiDeep (pencil-beam cone), DesiWedge (dec-band
    // fan), and DesiSgw (Sloan Great Wall) — all boot hidden, so those are the
    // rows that seed enabled:false.
    for (const id of GALAXY_CATALOG_IDS) {
      const entry = SOURCE_ENTRIES.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(items[id]).toEqual({ enabled: entry!.visible, labelEnabled: true });
    }
    expect(items.desiDeep).toEqual({ enabled: false, labelEnabled: true });
    expect(items.desiWedge).toEqual({ enabled: false, labelEnabled: true });
    expect(items.desiSgw).toEqual({ enabled: false, labelEnabled: true });
  });

  it('derives exactly one structure item row per id, each ring + label on', () => {
    const { items } = buildInitialSettings().structures;
    expect(Object.keys(items).sort()).toEqual([...STRUCTURE_IDS].sort());
    for (const id of STRUCTURE_IDS) {
      expect(items[id]).toEqual({ enabled: true, labelEnabled: true });
    }
  });

  it('wires per-field defaults from data/defaults', () => {
    const s = buildInitialSettings();
    expect(s.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(s.starCatalogs.sizePx).toBe(DEFAULT_STAR_SIZE_PX);
    expect(s.starCatalogs.brightness).toBe(DEFAULT_STAR_BRIGHTNESS);
    expect(s.starCatalogs.refineThreshold).toBe(DEFAULT_REFINE_THRESHOLD);
    expect(s.starCatalogs.glowOverlap).toBe(DEFAULT_STAR_GLOW_OVERLAP);
    expect(s.flow).toEqual(DEFAULT_FLOW);
    // Spread, not aliased — mutating the result must not write the seed.
    expect(s.flow).not.toBe(DEFAULT_FLOW);
  });

  describe('under `?vr`', () => {
    const originalSearch = window.location.search;

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...window.location, search: originalSearch },
      });
    });

    function setSearch(s: string): void {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...window.location, search: s },
      });
    }

    it('leaves the star-catalogs master gate on while defaulting only the famous-star map on', () => {
      // Regression: the master gate used to be forced off alongside the
      // per-row items. `starCatalogVisible` ANDs the master against each row,
      // so with the master off, re-enabling a single row's sidebar checkbox
      // did nothing — the Stars section's header checkbox (the only sidebar
      // control for the master) had to be found and flipped too. Leaving the
      // master on makes a single row's own checkbox sufficient again, the
      // same one-click contract the Galaxies section (no separate master
      // gate) already gives. The famous-star map is the one row that stays
      // on: the curated set the headset demo flies through, not a bulk
      // survey the Quest would choke fetching.
      setSearch('?vr');
      const s = buildInitialSettings();
      expect(s.starCatalogs.enabled).toBe(true);
      for (const id of Object.keys(s.starCatalogs.items)) {
        expect(s.starCatalogs.items[id as keyof typeof s.starCatalogs.items].enabled).toBe(
          id === 'famousStar',
        );
      }
    });

    it('disables the selection-ring and Label2D swap-target passes', () => {
      // Regression: Label2D captions swim with the head in VR because their
      // projections memoize per frame-ctx, serving one eye's vp to both — so
      // they must be off whenever `produceVrLabels`'s Label3D captions take
      // over (see initialState.ts's disabledPasses comment for the pass ↔
      // director mapping).
      setSearch('?vr');
      const { disabledPasses } = buildInitialSettings().debug;
      expect(disabledPasses).toEqual({
        'selection-ring': true,
        'near0-selection-ring': true,
        labels: true,
        'marker-lines': true,
        'foreground-labels': true,
      });
    });

    it('defaults 2MRS and Famous on while forcing every other galaxy catalog off', () => {
      // 2MRS is the headset's default galaxy layer: 35k all-sky points, light
      // enough for the Quest's frame budget. Famous is the curated thumbnail
      // set the headset demo is built to fly through. Every other galaxy
      // catalog stays off, unlike the un-forced star-catalogs master gate
      // above.
      setSearch('?vr');
      const { items } = buildInitialSettings().galaxyCatalogs;
      for (const id of Object.keys(items)) {
        expect(items[id as keyof typeof items].enabled).toBe(
          id === '2mrs' || id === 'famousGalaxy',
        );
      }
    });
  });
});
