/**
 * captureGalaxyFocusIds — unit tests.
 *
 * The function's job is to snapshot durable focus ids for the select and focus
 * slots BEFORE a tier swap replaces the old clouds, but ONLY for sources whose
 * `galaxyCatalogRequest` actually drifts across the given prev→next transition
 * AND are enabled. A source that doesn't drift, or isn't enabled, must be
 * skipped to avoid a hanging `take` on a pulse that never comes.
 *
 * SDSS ships tier variants, so its request carries the tier name: `medium`
 * differs from `large`, but `large` matches `large`.
 *
 * 2MRS, Famous and the DESI cuts have empty `tierTargets`, so
 * `galaxyCatalogRequest` drops the tier and names the same request for every
 * swap — they never drift.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { captureGalaxyFocusIds } from '../../../src/state/selection/captureGalaxyFocusIds';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../src/state/selection/selectionSlice';
import { setGalaxyCatalogVisible } from '../../../src/layers/galaxyCatalog/settings/galaxyCatalogsSlice';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture } from '../../support/selectionResolverOver';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal GalaxyCatalog with a single row identified by objId. */
function makeCloud(objId: bigint): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array([100, 0, 0]),
    spectroscopicZ: new Float32Array([0.02]),
    magU: new Float32Array([18]),
    magG: new Float32Array([17]),
    magR: new Float32Array([16]),
    magI: new Float32Array([16]),
    magZ: new Float32Array([16]),
    objIDs: new BigUint64Array([objId]),
    diameterKpc: new Float32Array([30]),
    axisRatio: new Float32Array([1]),
  });
}

/** ResolveDeps that exposes an SDSS cloud with a known objId. */
function makeSdssResolveDeps(): ResolveDeps {
  return {
    structures: { byId: () => null, byCategory: () => [] },
    stars: { current: () => null },
  };
}

/** The galaxyCatalog Layer's slice: one SDSS cloud carrying the durable id under test. */
function makeSdssGalaxies(objId: bigint): GalaxyRowFixture {
  return {
    catalogs: new Map([[Source.SDSS, makeCloud(objId)]]),
    famousMeta: [],
  } as unknown as GalaxyRowFixture;
}

/** No cloud at all — every galaxy id resolves to null. */
const NO_GALAXIES = { catalogs: new Map(), famousMeta: [] } as unknown as GalaxyRowFixture;

function buildStore() {
  return configureStore({ reducer: rootReducer });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// SDSS ships tier variants, so its request names `medium` vs `large` — different.
// Used throughout as the "source that reloads on medium→large" test case.
const SDSS_OBJ_ID = 1237668393006604288n;
const SDSS_REF = { type: 'galaxyCatalog' as const, source: Source.SDSS, index: 0 };

describe('captureGalaxyFocusIds', () => {
  it('a tiered enabled source is captured with its durable id', () => {
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(SDSS_OBJ_ID)),
      'medium',
      'large',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slot: 'select',
      source: Source.SDSS,
      focusId: `sdss-${SDSS_OBJ_ID}`,
    });
  });

  it('captures a galaxy focus ref when the source reloads on this swap', () => {
    const store = buildStore();
    store.dispatch(updateSelectionFocus(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(SDSS_OBJ_ID)),
      'medium',
      'large',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slot: 'focus', source: Source.SDSS });
  });

  it('does NOT capture a galaxy ref when the request does not drift across prev→next', () => {
    // SDSS ships tier variants, but large→large names the same request both sides.
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(SDSS_OBJ_ID)),
      'large',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('a tier-agnostic source is not captured', () => {
    // 2MRS and Famous have empty tierTargets, so galaxyCatalogRequest names the
    // same request for every tier — every swap, not just one pair, must skip.
    const resolveDeps: ResolveDeps = {
      structures: { byId: () => null, byCategory: () => [] },
      stars: { current: () => null },
    };

    for (const source of [Source.TwoMRS, Source.FamousGalaxy]) {
      for (const [prevTier, nextTier] of [
        ['small', 'large'],
        ['medium', 'large'],
      ] as const) {
        const store = buildStore();
        store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source, index: 0 }));

        const result = captureGalaxyFocusIds(
          store.getState(),
          selectionResolverOver(resolveDeps, NO_GALAXIES),
          prevTier,
          nextTier,
        );

        expect(result).toHaveLength(0);
      }
    }
  });

  it('does NOT capture a structure ref', () => {
    const store = buildStore();
    store.dispatch(updateSelectionSelect({ type: 'structure', id: 'cluster-virgo' }));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(1n)),
      'medium',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('skips a galaxy ref whose cloud is absent (focusIdOf returns null)', () => {
    // An absent cloud makes focusIdOf return null. The ref should be skipped so
    // no null focusId pollutes the output array.
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));

    const emptyDeps: ResolveDeps = {
      // SDSS cloud absent
      structures: { byId: () => null, byCategory: () => [] },
      stars: { current: () => null },
    };

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(emptyDeps, NO_GALAXIES),
      'medium',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('a disabled source is not captured', () => {
    // SDSS's request differs across medium→large, so the drift check alone would
    // capture it. But the demand loop only reloads a slot it demands, and a
    // disabled catalog is never demanded — no landed pulse fires for it — so
    // capture must not wait on it either, or the consumer's `take` blocks forever.
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));
    store.dispatch(setGalaxyCatalogVisible({ id: 'sdss', enabled: false }));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(SDSS_OBJ_ID)),
      'medium',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('does NOT capture the hover slot (hover is cleared across the swap, not re-anchored)', () => {
    // captureGalaxyFocusIds only captures select + focus. Even if hover holds a
    // galaxy ref on a reloading source, it must NOT appear in the output because
    // watchTierSaga clears hover unconditionally and re-anchoring would fight that clear.
    const store = buildStore();
    store.dispatch(updateSelectionHover(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      selectionResolverOver(makeSdssResolveDeps(), makeSdssGalaxies(SDSS_OBJ_ID)),
      'medium',
      'large',
    );

    expect(result.every((r) => r.slot !== 'hover')).toBe(true);
    expect(result).toHaveLength(0);
  });
});
