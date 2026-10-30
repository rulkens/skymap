import { describe, expect, it } from 'vitest';
import { buildSatelliteCatalog } from '../../../tools/satellites/buildSatelliteCatalog';
import { SATELLITE_CLASSES } from '../../../src/data/satellites/satelliteClasses';
import type { CelestrakOmm } from '../../../tools/@types/satellites/CelestrakOmm';

const omm = (id: number, name: string, over: Partial<CelestrakOmm> = {}): CelestrakOmm => ({
  OBJECT_NAME: name,
  OBJECT_ID: `2026-001${String.fromCharCode(64 + (id % 26) + 1)}`,
  EPOCH: '2026-10-27T03:45:44.572896',
  MEAN_MOTION: 15.5,
  ECCENTRICITY: 0.001,
  INCLINATION: 53,
  RA_OF_ASC_NODE: 10,
  ARG_OF_PERICENTER: 20,
  MEAN_ANOMALY: 30,
  EPHEMERIS_TYPE: 0,
  NORAD_CAT_ID: id,
  BSTAR: 1e-4,
  MEAN_MOTION_DOT: 1e-5,
  MEAN_MOTION_DDOT: 0,
  ...over,
});

const classesOf = (cat: ReturnType<typeof buildSatelliteCatalog>['catalog']) =>
  Object.fromEntries([...cat.noradId].map((id, k) => [id, SATELLITE_CLASSES[cat.classCode[k]!]]));

describe('buildSatelliteCatalog', () => {
  it('keeps the class of the first group that lists an object', () => {
    // A fresh launch is in both `active` and `last-30-days`; it must stay an active payload.
    const { catalog } = buildSatelliteCatalog(
      [
        { group: { group: 'active', class: 'active' }, records: [omm(70001, 'STARLINK-1')] },
        {
          group: { group: 'last-30-days', class: 'by-name' },
          records: [omm(70001, 'STARLINK-1'), omm(70002, 'CZ-6A DEB'), omm(70003, 'CZ-6A R/B')],
        },
      ],
      0,
    );
    expect(classesOf(catalog)).toEqual({ 70001: 'active', 70002: 'debris', 70003: 'other' });
  });

  it('drops what SGP4 cannot run and counts it', () => {
    const { catalog, dropped } = buildSatelliteCatalog(
      [
        {
          group: { group: 'analyst', class: 'other' },
          records: [
            omm(1, 'OK'),
            omm(2, 'SGP4-XP FIT', { EPHEMERIS_TYPE: 4 }),
            omm(3, 'HYPERBOLIC', { ECCENTRICITY: 1.2 }),
            omm(4, 'NO MEAN MOTION', { MEAN_MOTION: 0 }),
            omm(5, 'NAN BSTAR', { BSTAR: Number.NaN }),
          ],
        },
      ],
      0,
    );
    expect([...catalog.noradId]).toEqual([1]);
    expect(dropped).toBe(4);
  });
});
