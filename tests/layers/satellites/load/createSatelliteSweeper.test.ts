import { describe, expect, it } from 'vitest';
import { json2satrec, propagate } from 'satellite.js';
import { createSatelliteSweeper } from '../../../../src/layers/satellites/load/createSatelliteSweeper';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { HUBBLE_NORAD_ID } from '../../../../src/data/satellites/hubbleNoradId';
import type { CelestrakOmm } from '../../../../tools/@types/satellites/CelestrakOmm';

// CelesTrak records as downloaded on 2026-10-28: a low orbit, a GEO orbit (SGP4's deep-space branch) and
// Hubble, which the points skip. The reference is satellite.js run on the raw OMM, so any loss
// between the download and the worker (epoch digits, a dropped field, a unit) shows here.
const RECORDS = [
  {
    OBJECT_NAME: 'ISS (ZARYA)',
    OBJECT_ID: '1998-067A',
    EPOCH: '2026-10-27T04:14:31.558560',
    MEAN_MOTION: 15.49073103,
    ECCENTRICITY: 0.00069486,
    INCLINATION: 51.6336,
    RA_OF_ASC_NODE: 6.9404,
    ARG_OF_PERICENTER: 314.9066,
    MEAN_ANOMALY: 45.1358,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: 25544,
    BSTAR: 0.00011132043,
    MEAN_MOTION_DOT: 5.704e-5,
    MEAN_MOTION_DDOT: 0,
  },
  {
    OBJECT_NAME: 'GOES 18',
    OBJECT_ID: '2022-021A',
    EPOCH: '2026-10-27T05:53:31.873056',
    MEAN_MOTION: 1.00270727,
    ECCENTRICITY: 5.975e-5,
    INCLINATION: 0.0036,
    RA_OF_ASC_NODE: 29.4619,
    ARG_OF_PERICENTER: 239.0961,
    MEAN_ANOMALY: 78.4634,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: 51850,
    BSTAR: 0,
    MEAN_MOTION_DOT: 1.09e-6,
    MEAN_MOTION_DDOT: 0,
  },
  {
    OBJECT_NAME: 'HST',
    OBJECT_ID: '1990-037B',
    EPOCH: '2026-10-27T04:07:33.662496',
    MEAN_MOTION: 15.320941,
    ECCENTRICITY: 0.0001966,
    INCLINATION: 28.4738,
    RA_OF_ASC_NODE: 257.5897,
    ARG_OF_PERICENTER: 174.8269,
    MEAN_ANOMALY: 185.2348,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: HUBBLE_NORAD_ID,
    BSTAR: 0.00013432735,
    MEAN_MOTION_DOT: 4.519e-5,
    MEAN_MOTION_DDOT: 0,
  },
] satisfies CelestrakOmm[];

const { catalog } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: RECORDS }],
  0,
);
const at = Date.parse('2026-10-28T12:00:00Z');

describe('createSatelliteSweeper', () => {
  it('propagates each object to the position satellite.js gives from the raw OMM', () => {
    const { posKm, velKmS, valid } = createSatelliteSweeper(catalog).sweep(at);
    for (const record of RECORDS.slice(0, 2)) {
      const k = catalog.noradId.indexOf(record.NORAD_CAT_ID);
      const ref = propagate(
        json2satrec({
          ...record,
          EPHEMERIS_TYPE: 0,
          CLASSIFICATION_TYPE: 'U',
          ELEMENT_SET_NO: 999,
          REV_AT_EPOCH: 0,
        }),
        new Date(at),
      )!;
      expect(valid[k]).toBe(1);
      const dp = Math.hypot(
        posKm[3 * k]! - ref.position.x,
        posKm[3 * k + 1]! - ref.position.y,
        posKm[3 * k + 2]! - ref.position.z,
      );
      const dv = Math.hypot(
        velKmS[3 * k]! - ref.velocity.x,
        velKmS[3 * k + 1]! - ref.velocity.y,
        velKmS[3 * k + 2]! - ref.velocity.z,
      );
      // f32 storage at GEO radius rounds to ~4 m; anything larger is a real disagreement.
      expect(dp).toBeLessThan(0.01);
      expect(dv).toBeLessThan(1e-5);
    }
  });

  it('leaves Hubble out: the missions Layer draws its mesh', () => {
    const { valid } = createSatelliteSweeper(catalog).sweep(at);
    expect(valid[catalog.noradId.indexOf(HUBBLE_NORAD_ID)]).toBe(0);
  });

  it('marks an object SGP4 has propagated into the ground as not drawn', () => {
    // A low, draggy orbit a year past its epoch has decayed; SGP4 reports an error, not a point.
    const { valid } = createSatelliteSweeper(catalog).sweep(at + 3650 * 86_400_000);
    expect(valid[catalog.noradId.indexOf(25544)]).toBe(0);
  });
});
