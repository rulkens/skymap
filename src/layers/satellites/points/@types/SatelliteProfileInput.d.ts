/** The per-object catalog fields that decide a satellite's profile. */
export type SatelliteProfileInput = {
  readonly name: string;
  readonly cosparId: string;
  /** Index into `SATELLITE_CLASSES`. */
  readonly classCode: number;
  /** Revolutions per day. */
  readonly meanMotion: number;
  readonly eccentricity: number;
};
