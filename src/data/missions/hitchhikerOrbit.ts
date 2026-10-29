// The whale and petunias (Hitchhiker's Guide easter egg) share one 400 km
// circular geocentric orbit — the pot trails the whale in PHASE, not
// altitude — so one semi-major axis and period feed both `satellite()` rows.
// 40 m behind along the track, converted to mean-anomaly degrees by arc
// length: 40 / (2π·a) × 360. The period is exported because the whale's
// orbit lock reads it a second time, as a spin rate (`whale.ts`).

import { SCALE_UNITS } from '../scaleUnits';
import { EARTH_DATUM_RADIUS_M } from '../bodies/earthDatumRadiusM';
import { periodDaysFromSemiMajorKm } from '../../utils/orbit/periodDaysFromSemiMajorKm';

export const HITCHHIKER_ORBIT_SEMI_MAJOR_KM = EARTH_DATUM_RADIUS_M / 1000 + 400;
export const HITCHHIKER_ORBIT_PERIOD_DAYS = periodDaysFromSemiMajorKm(
  HITCHHIKER_ORBIT_SEMI_MAJOR_KM,
);
export const PETUNIA_TRAIL_OFFSET_DEG =
  (40 / (2 * Math.PI * HITCHHIKER_ORBIT_SEMI_MAJOR_KM * SCALE_UNITS.KM_TO_M)) * 360;
