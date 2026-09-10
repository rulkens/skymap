/** Feel-trial knobs (ruling 11), session-only. `northUp` gates the heading+roll
 * framing authority ONLY, never the C1 tilt wall (tilt 0 at disengage). */
export const ORIENT_TUNING: { blendSpace: 'lin' | 'log'; northUp: boolean } = {
  blendSpace: 'log',
  northUp: true,
};
