/**
 * focusReady tests — verifies the three cases: null ref, resolvable ref, and
 * a ref whose underlying data is not yet loaded.
 */

import { describe, it, expect } from 'vitest';
import { focusReady } from '../../../src/state/tour/focusReady';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

// A minimal single-row GalaxyCatalog stub. extractGalaxyRow reads .count,
// .positions, .objIDs, and the typed-array mag/size fields at index 0.
const LOADED_CLOUD: GalaxyCatalog = {
  count: 1,
  positions: new Float32Array([1, 0, 0]),
  spectroscopicZ: new Float32Array([0.01]),
  magU: new Float32Array([18]),
  magG: new Float32Array([17]),
  magR: new Float32Array([16]),
  magI: new Float32Array([16]),
  magZ: new Float32Array([16]),
  objIDs: new BigUint64Array([1n]),
  diameterKpc: new Float32Array([30]),
  axisRatio: new Float32Array([1]),
  positionAngleDeg: new Float32Array([0]),
  classByte: new Uint8Array([0]),
  parentSurveyByte: new Uint8Array([0]),
} as unknown as GalaxyCatalog;

// Stub that returns undefined for any source (cloud not loaded yet).
const depsWithoutCloud: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: { byId: () => null },
};

// Stub that returns the loaded cloud for source 0.
const depsWithCloud: ResolveDeps = {
  catalogs: { get: () => LOADED_CLOUD },
  famousMeta: [],
  structures: { byId: () => null },
};

// A structure ref — resolves against the byId store, always immediate.
const structureRef: SelectionRef = { type: 'structure', id: 'virgo' };
const depsWithStructure: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: {
    byId: (id) =>
      id === 'virgo'
        ? ({
            type: 'structure',
            id: 'virgo',
            name: 'Virgo Cluster',
            category: 'cluster',
            worldPos: [10, -20, 30],
            physicalRadiusMpc: 2,
            apparentRadiusMpc: 5,
            featured: true,
          } as const)
        : null,
  },
};

const galaxyRef: SelectionRef = { type: 'galaxyCatalog', source: 0, index: 0 };

describe('focusReady', () => {
  it('null ref (narration beat) → always ready', () => {
    expect(focusReady(null, depsWithoutCloud)).toBe(true);
  });

  it('structure ref that resolves → ready', () => {
    expect(focusReady(structureRef, depsWithStructure)).toBe(true);
  });

  it('milkyWay ref → always ready (singleton, no data needed)', () => {
    expect(focusReady({ type: 'milkyWay' }, depsWithoutCloud)).toBe(true);
  });

  it('galaxy ref when cloud is NOT loaded → not ready', () => {
    expect(focusReady(galaxyRef, depsWithoutCloud)).toBe(false);
  });

  it('galaxy ref when cloud IS loaded → ready', () => {
    expect(focusReady(galaxyRef, depsWithCloud)).toBe(true);
  });
});
