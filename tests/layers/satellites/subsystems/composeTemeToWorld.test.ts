import { describe, expect, it } from 'vitest';
import { json2satrec, propagate } from 'satellite.js';
import { composeTemeToWorld } from '../../../../src/layers/satellites/subsystems/composeTemeToWorld';
import { orientationForBody } from '../../../../src/data/bodies/orientationForBody';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { GOES_18 } from '../fixtures/celestrakRecords';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

const apply = (m: Mat3, v: readonly number[]): number[] =>
  [0, 1, 2].map((r) => m[r]! * v[0]! + m[3 + r]! * v[1]! + m[6 + r]! * v[2]!);
const applyT = (m: Mat3, v: readonly number[]): number[] =>
  [0, 1, 2].map((c) => m[3 * c]! * v[0]! + m[3 * c + 1]! * v[1]! + m[3 * c + 2]! * v[2]!);

// GOES 18 as CelesTrak published it on 2026-10-28: GOES-West, parked over 137.0° W. Carried through
// the composed rotation into the world and back out through Earth's own orientation, a
// geostationary satellite must land over that longitude of the globe Skymap draws, at any hour.
const GOES_18_SATREC = json2satrec({
  ...GOES_18,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 0,
});

describe('composeTemeToWorld', () => {
  it.each(['2026-10-28T00:00:00Z', '2026-10-28T06:00:00Z', '2026-10-28T15:30:00Z'])(
    'holds a geostationary satellite over its longitude on Earth at %s',
    (iso) => {
      const ms = Date.parse(iso);
      const simDays = unixMsToJulianDays(ms);
      const { position: p } = propagate(GOES_18_SATREC, new Date(ms))!;
      const earth = orientationForBody('earth', simDays, new Map());
      const world = apply(composeTemeToWorld(earth, simDays), [p.x, p.y, p.z]);
      const body = applyT(earth, world);
      const lonDeg = (Math.atan2(body[1]!, body[0]!) * 180) / Math.PI;
      // GMST and Skymap's ERA-based spin agree to ~0.01°; the slot itself drifts ±0.1°.
      expect(lonDeg).toBeCloseTo(-137.0, 0);
      expect(Math.abs(lonDeg + 137.0)).toBeLessThan(0.2);
    },
  );
});
