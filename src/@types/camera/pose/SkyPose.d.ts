/** The sky arm's whole state: where a standing eye looks. Azimuth runs north → east,
 *  altitude lies in [−π/2, π/2], and roll is identically zero. */
export type SkyPose = { readonly azimuthRad: number; readonly altitudeRad: number };
