/**
 * ORIENT_TUNING — the round-9 feel-trial knobs (ruling 11). Session-only,
 * written by the DebugPanel's orientation-tuning subsection; winning values
 * get hardcoded after the trial. `blendSpace` picks the parameter space
 * `bodyUpWeight` interpolates in ('log' is the trial default — zoom is
 * multiplicative, so log spreads the band evenly per notch). `northUp` gates
 * the heading+roll framing authority at its two arm sites; the C1 tilt wall
 * is deliberately NOT gated — tilt 0 at disengage keeps the fold retarget
 * view-exact whatever the toggle says.
 */
export const ORIENT_TUNING: { blendSpace: 'lin' | 'log'; northUp: boolean } = {
  blendSpace: 'log',
  northUp: true,
};
