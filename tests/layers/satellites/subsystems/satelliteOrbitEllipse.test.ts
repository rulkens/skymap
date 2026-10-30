/**
 * The ring is welded to the dot: the world point on the ellipse at the record's mean anomaly is the
 * position the camera-follow and the dots use, at any time, for a LEO and a GEO satellite.
 */
import { describe, expect, it } from 'vitest';
import { satelliteOrbitEllipse } from '../../../../src/layers/satellites/subsystems/satelliteOrbitEllipse';
import { satellitePositionMpc } from '../../../../src/layers/satellites/subsystems/satellitePositionMpc';
import { composeTemeToWorld } from '../../../../src/layers/satellites/subsystems/composeTemeToWorld';
import { eccentricAnomalyFromMean } from '../../../../src/utils/orbit/eccentricAnomalyFromMean';
import { satrecOf } from '../../../../src/layers/satellites/load/satrecOf';
import { orientationForBody } from '../../../../src/data/bodies/orientationForBody';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { GOES_18, ISS } from '../fixtures/celestrakRecords';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const { catalog } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [ISS, GOES_18] }],
  0,
);
const EARTH_MPC: Vec3 = [4.1e-6, -2.3e-6, 1.7e-6];

describe('satelliteOrbitEllipse', () => {
  it.each([
    ['ISS', 25544],
    ['GOES 18', 51850],
  ])('passes through the %s dot to well under a km', (_name, noradId) => {
    const k = catalog.noradId.indexOf(noradId);
    expect(k).toBeGreaterThanOrEqual(0);
    const satellite = { satrec: satrecOf(catalog, k), epochMs: catalog.epochMs[k]! };
    for (const iso of ['2026-10-28T12:00:00Z', '2026-11-03T03:17:00Z']) {
      const simDays = unixMsToJulianDays(Date.parse(iso));
      const positions = new Map([[SCENE_EARTH.id, EARTH_MPC]]);
      const orientation = orientationForBody(SCENE_EARTH.id, simDays, positions);
      const m = composeTemeToWorld(orientation, simDays);
      const ring = satelliteOrbitEllipse(satellite, simDays, m, EARTH_MPC)!;
      const big = eccentricAnomalyFromMean(ring.meanAnomalyRad, ring.eccentricity);
      const dot = satellitePositionMpc(catalog, k, simDays, {
        positionMpc: EARTH_MPC,
        orientation,
      })!;
      for (let i = 0; i < 3; i++) {
        const onRing =
          ring.centerMpc[i]! +
          ring.semiMajorMpc[i]! * Math.cos(big) +
          ring.semiMinorMpc[i]! * Math.sin(big);
        expect(Math.abs(onRing - dot[i]!) / SCALE_UNITS.KM_TO_MPC).toBeLessThan(0.5);
      }
    }
  });
});
