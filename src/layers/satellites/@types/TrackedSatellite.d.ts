/**
 * TrackedSatellite — one selected or focused satellite as the orbit ring needs it: the satrec
 * `createSelectedSatellites` already built for its positioner, the epoch SGP4 counts minutes from,
 * and its class code (index into `SATELLITE_CLASSES`) for the class fade.
 */
import type { json2satrec } from '../load/satelliteJsCore';

export type TrackedSatellite = {
  readonly satrec: ReturnType<typeof json2satrec>;
  readonly epochMs: number;
  readonly classCode: number;
};
