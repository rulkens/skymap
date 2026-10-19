/**
 * GALAXY_HUE_SLOPE — K_CI, the galaxy colour-index shift per octave of Doppler factor:
 * ci' = clamp(ci − K_CI · log₂ D, 0, 2). A visualisation constant, not photometry: at 0.25 a
 * source four octaves blue-shifted (D = 16) crosses most of the ramp. A starting value, tuned by eye.
 */
export const GALAXY_HUE_SLOPE = 0.25;
