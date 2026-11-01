/**
 * buildSatelliteCatalog — CelesTrak group downloads → one de-duplicated `SatelliteCatalog`. Groups
 * are taken in `CELESTRAK_GROUPS` order and the first group to list a NORAD id decides its class.
 * A record SGP4 cannot run (another ephemeris type, a hyperbolic or non-finite element set) is
 * dropped and counted, never patched.
 */
import { parseOmmEpochMs } from '../utils/time/parseOmmEpochMs';
import { SATELLITE_CLASSES } from '../../src/data/satellites/satelliteClasses';
import type { CelestrakGroup } from '../@types/satellites/CelestrakGroup';
import type { CelestrakOmm } from '../@types/satellites/CelestrakOmm';
import type { SatelliteCatalog } from '../../src/@types/satellites/SatelliteCatalog';
import type { SatelliteClass } from '../../src/@types/satellites/SatelliteClass';

const ELEMENT_FIELDS = [
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
] as const;

const runnable = (r: CelestrakOmm): boolean =>
  r.EPHEMERIS_TYPE === 0 &&
  ELEMENT_FIELDS.every((f) => Number.isFinite(r[f])) &&
  r.MEAN_MOTION > 0 &&
  r.ECCENTRICITY >= 0 &&
  r.ECCENTRICITY < 1;

const classOf = (group: CelestrakGroup, name: string): SatelliteClass =>
  group.class !== 'by-name' ? group.class : /\bDEB\b/.test(name) ? 'debris' : 'other';

export function buildSatelliteCatalog(
  downloads: readonly {
    readonly group: CelestrakGroup;
    readonly records: readonly CelestrakOmm[];
  }[],
  fetchedAtMs: number,
): { readonly catalog: SatelliteCatalog; readonly dropped: number } {
  const kept = new Map<number, { record: CelestrakOmm; cls: SatelliteClass }>();
  let dropped = 0;
  for (const { group, records } of downloads) {
    for (const record of records) {
      if (kept.has(record.NORAD_CAT_ID)) continue;
      if (!runnable(record)) {
        dropped++;
        continue;
      }
      kept.set(record.NORAD_CAT_ID, { record, cls: classOf(group, record.OBJECT_NAME) });
    }
  }

  const rows = [...kept.values()].sort((a, b) => a.record.NORAD_CAT_ID - b.record.NORAD_CAT_ID);
  const f64 = (pick: (r: CelestrakOmm) => number): Float64Array =>
    Float64Array.from(rows, ({ record }) => pick(record));
  const catalog: SatelliteCatalog = {
    fetchedAtMs,
    noradId: Uint32Array.from(rows, ({ record }) => record.NORAD_CAT_ID),
    classCode: Uint8Array.from(rows, ({ cls }) => SATELLITE_CLASSES.indexOf(cls)),
    epochMs: f64((r) => parseOmmEpochMs(r.EPOCH)),
    meanMotion: f64((r) => r.MEAN_MOTION),
    eccentricity: f64((r) => r.ECCENTRICITY),
    inclinationDeg: f64((r) => r.INCLINATION),
    raanDeg: f64((r) => r.RA_OF_ASC_NODE),
    argPericenterDeg: f64((r) => r.ARG_OF_PERICENTER),
    meanAnomalyDeg: f64((r) => r.MEAN_ANOMALY),
    bstar: f64((r) => r.BSTAR),
    meanMotionDot: f64((r) => r.MEAN_MOTION_DOT),
    meanMotionDdot: f64((r) => r.MEAN_MOTION_DDOT),
    names: rows.map(({ record }) => record.OBJECT_NAME),
    cosparIds: rows.map(({ record }) => record.OBJECT_ID),
  };
  return { catalog, dropped };
}
