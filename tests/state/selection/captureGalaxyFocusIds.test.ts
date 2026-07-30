/**
 * captureGalaxyFocusIds — unit tests.
 *
 * The function's job is to snapshot durable focus ids for the select and focus
 * slots BEFORE a tier swap evicts the old clouds, but ONLY for sources that
 * actually reload on the given prev→next transition. Tier-agnostic sources and
 * same-target swaps must be skipped to avoid a hanging `take(catalogLoaded)`.
 *
 * SDSS: tierTargets = { small: 0, medium: 156_000 } — the `large` key is absent
 * (undefined), meaning "uncapped". So `medium→large` differs: 156_000 vs undefined.
 * Verifying `medium→large` captures and `large→large` (same target: both undefined)
 * does not covers the predicate.
 *
 * 2MRS: tierTargets = {} — all tiers return undefined (tier-agnostic, never reloads).
 * Any prev→next should be skipped.
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
import { setGalaxyCatalogVisible } from '../../../src/state/settings/settingsSlice';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
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
function makeSdssResolveDeps(objId: bigint): ResolveDeps {
  const cloud = makeCloud(objId);
  return {
    catalogs: {
      get: (src) => (src === Source.SDSS ? cloud : undefined),
    },
    famousGalaxiesMeta: [],
    structures: { byId: () => null },
    stars: { current: () => null },
  };
}

function buildStore() {
  return configureStore({ reducer: rootReducer });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// SDSS: tierTarget(medium) = 156_000, tierTarget(large) = undefined → different.
// Used throughout as the "source that reloads on medium→large" test case.
const SDSS_OBJ_ID = 1237668393006604288n;
const SDSS_REF = { type: 'galaxyCatalog' as const, source: Source.SDSS, index: 0 };

describe('captureGalaxyFocusIds', () => {
  it('captures a galaxy select ref when the source reloads on this swap', () => {
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      makeSdssResolveDeps(SDSS_OBJ_ID),
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
      makeSdssResolveDeps(SDSS_OBJ_ID),
      'medium',
      'large',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slot: 'focus', source: Source.SDSS });
  });

  it('does NOT capture a galaxy ref when tierTarget is the same across prev→next', () => {
    // SDSS: tierTarget(large) = undefined, tierTarget(large) = undefined → same → skip.
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));

    const result = captureGalaxyFocusIds(
      store.getState(),
      makeSdssResolveDeps(SDSS_OBJ_ID),
      'large',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('does NOT capture a tier-agnostic source (2MRS has empty tierTargets)', () => {
    // 2MRS: tierTargets = {} → tierTarget returns undefined for every tier.
    // medium→large: undefined === undefined → skipped.
    const store = buildStore();
    store.dispatch(
      updateSelectionSelect({ type: 'galaxyCatalog', source: Source.TwoMRS, index: 0 }),
    );

    const resolveDeps: ResolveDeps = {
      catalogs: { get: () => undefined },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    };

    const result = captureGalaxyFocusIds(store.getState(), resolveDeps, 'medium', 'large');

    expect(result).toHaveLength(0);
  });

  it('does NOT capture a structure ref', () => {
    const store = buildStore();
    store.dispatch(updateSelectionSelect({ type: 'structure', id: 'cluster-virgo' }));

    const result = captureGalaxyFocusIds(
      store.getState(),
      makeSdssResolveDeps(1n),
      'medium',
      'large',
    );

    expect(result).toHaveLength(0);
  });

  it('does NOT capture a milkyWay ref', () => {
    const store = buildStore();
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));

    const result = captureGalaxyFocusIds(
      store.getState(),
      makeSdssResolveDeps(1n),
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
      catalogs: { get: () => undefined }, // SDSS cloud absent
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    };

    const result = captureGalaxyFocusIds(store.getState(), emptyDeps, 'medium', 'large');

    expect(result).toHaveLength(0);
  });

  it('does NOT capture a galaxy ref on a DISABLED source even when its tierTarget changes', () => {
    // SDSS's tierTarget differs across medium→large, so the tierTarget guard alone
    // would capture it. But `makeRunTierTransition` also skips disabled sources —
    // no `catalogLoaded` fires for them — so we must not capture them either or the
    // consumer's `take` blocks forever.
    const store = buildStore();
    store.dispatch(updateSelectionSelect(SDSS_REF));
    store.dispatch(setGalaxyCatalogVisible({ id: 'sdss', enabled: false }));

    const result = captureGalaxyFocusIds(
      store.getState(),
      makeSdssResolveDeps(SDSS_OBJ_ID),
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
      makeSdssResolveDeps(SDSS_OBJ_ID),
      'medium',
      'large',
    );

    expect(result.every((r) => r.slot !== 'hover')).toBe(true);
    expect(result).toHaveLength(0);
  });
});
