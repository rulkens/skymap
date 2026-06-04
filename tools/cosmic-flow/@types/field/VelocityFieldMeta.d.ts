/**
 * VelocityFieldMeta — the scalar metadata sidecar of the loaded CF4++ field.
 *
 * Mirrors the JSON written by `data/convertCf4ppVfield.py`. The renderer needs
 * these for normalisation: speeds drive the velocity colour ramp, δ stats drive
 * the density-volume ramp, and `n`/`boxMpcPerH` describe the grid geometry the
 * structure-placement math indexes into. Kept separate from the GPU-handle type
 * (`VelocityField`) so the pure numbers can be reasoned about (and tested)
 * without a device.
 */
export type VelocityFieldMeta = {
  /** Grid dimension along each axis (128). */
  readonly n: number;
  /** Physical box size in Mpc/h (1000). */
  readonly boxMpcPerH: number;
  /** Max / 99th-percentile speed (km/s), for colour-ramp normalisation. */
  readonly speedKmsMax: number;
  readonly speedKmsP99: number;
  /** Max / 99th-percentile overdensity δ, for the density-volume ramp. */
  readonly deltaMax: number;
  readonly deltaP99: number;
};
