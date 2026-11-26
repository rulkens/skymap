/** The invented climb from the pad to a track's first sample: up to a parking orbit first, as the launcher did. */
export const LAUNCH_CLIMB = {
  /** Parking-orbit altitude, km: the Titan IIIE-Centaur put the Voyagers in a parking orbit about 170 km up. */
  parkKm: 170,
  /** Time from lift-off to parking height, s: the Titan-Centaur's powered ascent took about ten minutes. */
  riseS: 600,
} as const;
