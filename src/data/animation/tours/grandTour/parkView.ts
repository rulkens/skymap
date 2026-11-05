/**
 * PARK_VIEW — the bearing beat 00 stands on at Søndermarken and the altitude it
 * looks up to at night, on the `{ sky }` arm (yaw = azimuth, pitch = altitude).
 * Beat 01 restates the night view, so a skip or Prev starts its rise where beat
 * 00 ends.
 */
export const PARK_VIEW = {
  // Due north up the scan's open lawn: the one corridor with sky to the horizon,
  // front-lit by the noon Sun (south and south-east are backlit canopy).
  azimuthRad: 0.15,
  // Short of the zenith, where azimuth stops meaning anything: Cassiopeia to
  // Cygnus fills the frame at 20:00 UTC.
  nightAltitudeRad: 1.4,
} as const;
