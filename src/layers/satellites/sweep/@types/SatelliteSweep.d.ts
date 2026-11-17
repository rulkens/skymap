/**
 * SatelliteSweep — every satellite's TEME state at one sim instant, from one worker sweep. Index k
 * is catalog object k. km and km/s relative to Earth's centre; `valid[k]` is 0 where SGP4 failed
 * (decayed, perigee below the surface) or the object is drawn elsewhere (Hubble's mesh).
 */
export type SatelliteSweep = {
  readonly simMs: number;
  readonly posKm: Float32Array;
  readonly velKmS: Float32Array;
  readonly valid: Uint8Array;
};
