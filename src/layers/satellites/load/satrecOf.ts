/**
 * satrecOf — catalog object k as a `satellite.js` satrec, through the OMM the file was built from
 * (`json2satrec` takes the epoch only as a string). The worker builds every one of them; the main
 * thread builds the selected and focused satellites' satrecs, per frame.
 */
import { json2satrec } from './satelliteJsCore';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';

export function satrecOf(cat: SatelliteCatalog, k: number): ReturnType<typeof json2satrec> {
  return json2satrec({
    OBJECT_NAME: cat.names[k]!,
    OBJECT_ID: cat.cosparIds[k]!,
    EPOCH: new Date(cat.epochMs[k]!).toISOString(),
    MEAN_MOTION: cat.meanMotion[k]!,
    ECCENTRICITY: cat.eccentricity[k]!,
    INCLINATION: cat.inclinationDeg[k]!,
    RA_OF_ASC_NODE: cat.raanDeg[k]!,
    ARG_OF_PERICENTER: cat.argPericenterDeg[k]!,
    MEAN_ANOMALY: cat.meanAnomalyDeg[k]!,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: cat.noradId[k]!,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 0,
    BSTAR: cat.bstar[k]!,
    MEAN_MOTION_DOT: cat.meanMotionDot[k]!,
    MEAN_MOTION_DDOT: cat.meanMotionDdot[k]!,
  });
}
