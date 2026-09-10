/** Feel-trial knobs (ruling 11), session-only. `northUp` gates the heading+roll
 * framing authority ONLY, never the C1 tilt wall (tilt 0 at disengage).
 * `blendSpace` is 'log' because zoom is multiplicative: log(h/R) spreads the
 * band evenly per notch, half-weight at its geometric midpoint. */
export const ORIENT_TUNING: { blendSpace: 'lin' | 'log'; northUp: boolean } = {
  blendSpace: 'log',
  northUp: true,
};
