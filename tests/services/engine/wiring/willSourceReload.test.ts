/**
 * willSourceReload — unit tests for the shared tier-reload predicate.
 *
 * The function answers one question for both the transition runner (which fires
 * the load) and the re-anchor capture (which waits for the resulting
 * `catalogLoaded`): does this source re-fetch on a given prev→next swap? The
 * cases below pin every skip clause so the two consumers can rely on the same
 * truth.
 *
 * Tier facts used (from the real registry caps):
 *   SDSS:  tierTarget(medium) = 156_000, tierTarget(large) = undefined → differ.
 *   2MRS:  tierTargets = {} → undefined for every tier → never reloads.
 *
 * The synthetic case also guards clause ORDER: synthetic has no
 * `galaxyCatalogs.items` row, so the predicate must short-circuit on category
 * BEFORE the `items[...].enabled` access — otherwise it would throw.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { willSourceReload } from '../../../../src/services/engine/wiring/willSourceReload';
import { setGalaxyCatalogVisible } from '../../../../src/state/settings/settingsSlice';
import { Source } from '../../../../src/data/sources';

function settingsOf() {
  return configureStore({ reducer: rootReducer }).getState().settings;
}

describe('willSourceReload', () => {
  it('returns true for an enabled survey whose tierTarget changes (SDSS medium→large)', () => {
    expect(willSourceReload(Source.SDSS, 'medium', 'large', settingsOf())).toBe(true);
  });

  it('returns false when the tierTarget is unchanged (SDSS large→large)', () => {
    expect(willSourceReload(Source.SDSS, 'large', 'large', settingsOf())).toBe(false);
  });

  it('returns false for a tier-agnostic source (2MRS medium→large)', () => {
    expect(willSourceReload(Source.TwoMRS, 'medium', 'large', settingsOf())).toBe(false);
  });

  it('returns false for a disabled source even when its tierTarget changes', () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setGalaxyCatalogVisible({ id: 'sdss', enabled: false }));
    expect(willSourceReload(Source.SDSS, 'medium', 'large', store.getState().settings)).toBe(false);
  });

  it('returns false for the synthetic source without throwing (clause-order guard)', () => {
    const settings = settingsOf();
    // Synthetic has no `galaxyCatalogs.items` row; a wrong clause order would
    // throw on the `.enabled` access rather than return false.
    expect(() => willSourceReload(Source.Synthetic, 'medium', 'large', settings)).not.toThrow();
    expect(willSourceReload(Source.Synthetic, 'medium', 'large', settings)).toBe(false);
  });
});
