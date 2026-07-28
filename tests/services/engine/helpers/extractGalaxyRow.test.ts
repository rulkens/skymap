import { describe, it, expect } from 'vitest';

import { extractGalaxyRow } from '../../../../src/services/engine/helpers/extractGalaxyRow';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function makeCloud(): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigUint64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
  });
}

describe('extractGalaxyRow', () => {
  it('reads the raw cloud slots into a serializable row (objId as string)', () => {
    const row = extractGalaxyRow(makeCloud(), 0, Source.SDSS);
    expect(row).toMatchObject({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
      objId: '1237668',
      x: 10,
      y: 20,
      z: 30,
      magG: expect.closeTo(17.4, 4),
      diameterKpc: expect.closeTo(42, 4),
      axisRatio: expect.closeTo(0.7, 4),
      positionAngleDeg: expect.closeTo(35, 4),
      classByte: 0,
      parentSurveyByte: 0,
      orientationIsFallback: false,
      diameterIsFallback: false,
    });
    // No bigint anywhere — JSON round-trip must succeed.
    expect(() => JSON.stringify(row)).not.toThrow();
  });

  it('maps the persisted orientationIsFallback byte (1) to a boolean true', () => {
    const cloud = makeCloud();
    cloud.orientationIsFallback[0] = 1;
    const row = extractGalaxyRow(cloud, 0, Source.SDSS);
    expect(row!.orientationIsFallback).toBe(true);
  });

  it('maps the persisted diameterIsFallback byte (1) to a boolean true', () => {
    const cloud = makeCloud();
    cloud.diameterIsFallback[0] = 1;
    const row = extractGalaxyRow(cloud, 0, Source.SDSS);
    expect(row!.diameterIsFallback).toBe(true);
  });

  it('returns null for an out-of-bounds index or missing cloud (tier-swap race guard)', () => {
    expect(extractGalaxyRow(makeCloud(), 5, Source.SDSS)).toBeNull();
    expect(extractGalaxyRow(undefined, 0, Source.SDSS)).toBeNull();
  });
});
