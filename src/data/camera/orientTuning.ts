/**
 * ORIENT_TUNING — feel-trial knobs (ruling 11), session-only, written by the
 * DebugPanel's orientation-tuning subsection. `blendSpace` picks the parameter
 * space `bodyUpWeight` interpolates in: 'log' because zoom is multiplicative,
 * so log spreads the band evenly per notch. `northUp` gates the heading+roll
 * framing authority at its two arm sites; the C1 tilt wall is deliberately NOT
 * gated — tilt 0 at disengage keeps the fold retarget view-exact whatever the
 * toggle says.
 */
export const ORIENT_TUNING: { blendSpace: 'lin' | 'log'; northUp: boolean } = {
  blendSpace: 'log',
  northUp: true,
};
