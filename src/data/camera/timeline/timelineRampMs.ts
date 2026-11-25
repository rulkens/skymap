/**
 * Wall time in which the timeline clock may speed up e-fold, ms. Leaving a flyby's cap the sim
 * speed would otherwise leap a thousandfold in one step and yank the camera mid-ease.
 */
export const TIMELINE_RAMP_MS = 500;
