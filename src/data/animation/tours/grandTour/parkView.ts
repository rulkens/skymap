/**
 * PARK_VIEW — where beat 00's night view rests at Søndermarken, on the `{ sky }`
 * arm (yaw = azimuth, pitch = altitude). Beat 01 restates it, so a skip or Prev
 * starts its rise where beat 00 ends.
 */
export const PARK_VIEW = {
  // Near due north: beat 01 hands the view to the body arm due north under the
  // celestial pole, so beat 00's pan ends turned that way.
  azimuthRad: 0.15,
  // Short of the zenith, where azimuth stops meaning anything: Cygnus overhead
  // to Cassiopeia fills the frame at TOUR_NIGHT_SIM_DAYS.
  nightAltitudeRad: 1.4,
} as const;
