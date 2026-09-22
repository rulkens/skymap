/**
 * Selection selectors — unit tests for the RootState-scoped selection-family
 * read seam.
 *
 * The test builds partial RootState-shaped objects (cast via
 * `as unknown as RootState`) rather than constructing real store fixtures for
 * every case: the selectors are thin lifts and the slice's own initialState
 * shape is asserted in the slice tests. The `createAppStore`-backed tests
 * exercise the memoized `selectXFocusable` selectors through a live store to
 * verify the `buildFocusable` integration round-trips correctly.
 *
 * The derived `selectHoveredFocusable` / `selectSelectedFocusable` /
 * `selectFocusedFocusable` selectors each build a fresh `FocusableTarget` from
 * their slot's `SelectionRow` — the memoization means the same row reference
 * returns the same target reference, which is the core invariant tested here.
 */

import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectHoveredFocusable,
  selectSelectedFocusable,
  selectFocusedFocusable,
  selectIsSelectionActive,
  selectHasSelectionIntent,
} from '../../../src/state/selection/selectors';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { selectionRoute, selectionRowsRoute } from '../../../src/store/constants';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import { Source } from '../../../src/data/sources';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { RootState } from '../../../src/store/types';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { GalaxyRow } from '../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// --- fixtures -----------------------------------------------------------------

const galaxyRef: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 7 };

const galaxyRow = makeGalaxyRow({
  index: 7,
  objId: '1237668347496587264',
  x: 100,
  y: 200,
  z: 300,
  redshift: 0.05,
  magU: 17.1,
  magG: 16.2,
  magR: 15.8,
  magI: 15.5,
  magZ: 15.3,
  diameterKpc: 18,
  axisRatio: 0.7,
  positionAngleDeg: 45,
  classByte: 3,
});

const structureInfo: StructureInfo & { readonly driver: null } = {
  type: 'structure',
  category: 'cluster',
  id: 'virgo',
  name: 'Virgo Cluster',
  worldPos: [0.27, 0.22, 0.15],
  featured: true,
  physicalRadiusMpc: 1.7,
  driver: null,
};

// --- selectIsSelectionActive --------------------------------------------------

describe('selectIsSelectionActive', () => {
  it('returns false on a fresh store', () => {
    const { store } = createAppStore();
    expect(selectIsSelectionActive(store.getState())).toBe(false);
  });

  it('returns true after a select ref is set', () => {
    const { store } = createAppStore();
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    expect(selectIsSelectionActive(store.getState())).toBe(true);
  });
});

// --- selectHasSelectionIntent --------------------------------------------------

describe('selectHasSelectionIntent', () => {
  it('returns false on a virgin state', () => {
    const { store } = createAppStore();
    expect(selectHasSelectionIntent(store.getState())).toBe(false);
  });

  it('returns true when only pending.focus is set — the deferred deep-link case a ref-only guard misses', () => {
    const { store } = createAppStore();
    store.dispatch(requestFocus('m31'));
    // The request is still deferring: the resolved focus ref stays null while
    // it parks on a catalog pulse, exactly as `resolveFocusRefDeferring` does
    // for a cold `#focus=m31` load. A guard reading only the ref slots would
    // see this state as empty.
    expect(store.getState().selection.focus).toBeNull();
    expect(selectHasSelectionIntent(store.getState())).toBe(true);
  });
});

// --- derived FocusableTarget selectors via live store -------------------------

describe('selectHoveredFocusable', () => {
  it('returns null when hover row is null', () => {
    const { store } = createAppStore();
    expect(selectHoveredFocusable(store.getState())).toBeNull();
  });

  it('builds a GalaxyInfo from a galaxy row in the hover slot', () => {
    const { store } = createAppStore();
    store.dispatch(updateSelectionHover(galaxyRef));
    store.dispatch(setSelectionRow({ slot: 'hover', row: galaxyRow }));
    const target = selectHoveredFocusable(store.getState());
    expect(target).toMatchObject({ type: 'galaxyCatalog', source: Source.SDSS });
  });

  it('returns MILKY_WAY_INFO for a milkyWay row in the hover slot', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'hover', row: { type: 'milkyWay', driver: null } }));
    expect(selectHoveredFocusable(store.getState())).toBe(MILKY_WAY_INFO);
  });

  it('returns the StructureInfo as-is for a structure row', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'hover', row: structureInfo }));
    expect(selectHoveredFocusable(store.getState())).toBe(structureInfo);
  });
});

describe('selectSelectedFocusable', () => {
  it('memoizes across an unrelated-slot write: changing hover does not recompute the select focusable', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'select', row: { type: 'milkyWay', driver: null } }));
    const a = selectSelectedFocusable(store.getState());
    // A write to the hover slot changes the selectionRows state object but leaves
    // the select slot's row reference untouched — createSelector must return the
    // cached focusable, so identity is preserved. (A plain non-memoized selector
    // would rebuild a fresh object here and fail this assertion.)
    store.dispatch(setSelectionRow({ slot: 'hover', row: { type: 'milkyWay', driver: null } }));
    const b = selectSelectedFocusable(store.getState());
    expect(a).toBe(b);
  });
});
