/** One source's particles, struct-of-arrays, before they are interleaved into STRM records. */
export type StreamParticles = {
  /** n × 3, heliocentric equatorial, Mpc. */
  readonly positionsMpc: Float32Array;
  /** n × 3, unit, the direction the stars move along the stream. */
  readonly tangents: Float32Array;
  readonly sizeMpc: Float32Array;
  readonly luminosity: Float32Array;
  readonly colourT: Float32Array;
};
