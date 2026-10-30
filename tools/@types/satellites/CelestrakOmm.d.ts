/** CelestrakOmm — the fields of one CelesTrak GP record (`FORMAT=json`) the satellites build reads. */
export type CelestrakOmm = {
  readonly OBJECT_NAME: string;
  readonly OBJECT_ID: string;
  /** UTC, no zone suffix, microseconds: `2026-10-27T03:45:44.572896`. */
  readonly EPOCH: string;
  readonly MEAN_MOTION: number;
  readonly ECCENTRICITY: number;
  readonly INCLINATION: number;
  readonly RA_OF_ASC_NODE: number;
  readonly ARG_OF_PERICENTER: number;
  readonly MEAN_ANOMALY: number;
  /** 0 = SGP4 mean elements; anything else was fitted for another propagator. */
  readonly EPHEMERIS_TYPE: number;
  readonly NORAD_CAT_ID: number;
  readonly BSTAR: number;
  readonly MEAN_MOTION_DOT: number;
  readonly MEAN_MOTION_DDOT: number;
};
