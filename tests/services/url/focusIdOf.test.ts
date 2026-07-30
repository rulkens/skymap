/**
 * Tests for focusIdOf — the SelectionRef → focus-id URL encoder.
 *
 * focusIdOf replaces selectionToFocusId (which took a pre-built GalaxyInfo).
 * These tests verify the priority ladder (famous > pgc > sdss > pos fallback)
 * and the round-trip through bigint-precision SDSS objIDs, which exceed
 * JS's Number.MAX_SAFE_INTEGER.
 *
 * The cloud fixture is intentionally minimal: focusIdOf reads exactly
 * objIDs[index], positions[index*3…], and the famousGalaxiesMeta array.
 */

import { describe, it, expect } from 'vitest';
import { focusIdOf } from '../../../src/services/url/focusIdOf';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * Build a one-row GalaxyCatalog fixture with the given objId.
 * Positions are set to (1, 0, 0) → RA = 0°, Dec = 0°.
 * The brief correction: objIDs is BigUint64Array (unsigned), not BigInt64Array.
 */
function makeCloud(objId: bigint, pos: [number, number, number] = [1, 0, 0]): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array(pos),
    spectroscopicZ: new Float32Array([0.01]),
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

const deps: ResolveDeps = {
  catalogs: {
    get: (s) => {
      if (s === Source.SDSS) return makeCloud(1237668393006604288n);
      if (s === Source.Glade) return makeCloud(99n);
      if (s === Source.TwoMRS) return makeCloud(2789n);
      if (s === Source.FamousGalaxy) return makeCloud(0n);
      return undefined;
    },
  },
  famousGalaxiesMeta: [
    { id: 'm31', names: ['M31', 'Andromeda'], description: 'The Andromeda Galaxy', type: 'Sb' },
  ],
  structures: { byId: () => null },
  stars: { current: () => null },
};

describe('focusIdOf', () => {
  it('SDSS galaxy → sdss-<objId>', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, deps)).toBe(
      'sdss-1237668393006604288',
    );
  });

  it('GLADE galaxy with PGC → pgc-<objId>', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.Glade, index: 0 }, deps)).toBe(
      'pgc-99',
    );
  });

  it('2MRS galaxy with PGC → pgc-<objId>', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.TwoMRS, index: 0 }, deps)).toBe(
      'pgc-2789',
    );
  });

  it('Famous galaxy → bare famous id', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 }, deps)).toBe(
      'm31',
    );
  });

  it('galaxy with objId 0n → pos@ fallback (4-decimal RA/Dec)', () => {
    // A cloud where objId = 0n and position = (1, 0, 0) → RA 0.0000, Dec 0.0000
    const noIdDeps: ResolveDeps = {
      ...deps,
      catalogs: {
        get: (s) => (s === Source.TwoMRS ? makeCloud(0n, [1, 0, 0]) : undefined),
      },
    };
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.TwoMRS, index: 0 }, noIdDeps)).toBe(
      'pos@0.0000,0.0000',
    );
  });

  it('structure ref → bare structure id', () => {
    expect(focusIdOf({ type: 'structure', id: 'cluster-virgo' }, deps)).toBe('cluster-virgo');
  });

  it('structure ref with arbitrary id → bare id', () => {
    expect(focusIdOf({ type: 'structure', id: 'supercluster-hydra-wall' }, deps)).toBe(
      'supercluster-hydra-wall',
    );
  });

  it('milkyWay ref → the fixed deep-link literal', () => {
    // The Milky Way is a singleton; it encodes to MILKY_WAY_FOCUS_ID, which
    // resolveFocusId decodes back to { type: 'milkyWay' }.
    expect(focusIdOf({ type: 'milkyWay' }, deps)).toBe(MILKY_WAY_FOCUS_ID);
    expect(focusIdOf({ type: 'milkyWay' }, deps)).toBe('milkyWay');
  });

  it('cloud not loaded → null (graceful cloud-not-loaded edge)', () => {
    const emptyDeps: ResolveDeps = {
      ...deps,
      catalogs: { get: () => undefined },
    };
    expect(
      focusIdOf({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, emptyDeps),
    ).toBeNull();
  });
});
