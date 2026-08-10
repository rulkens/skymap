/**
 * ismMapAzIndexForAngle — wraps a world angle into [0, 2*PI) (`atan2(z, x)`
 * convention — see `sampleGalaxyIsmMap`/`sampleIsmMapOrientation`'s own
 * headers) and buckets it into one of `az` azimuth bins. Shared so the two
 * nearest-texel samplers can't disagree at the seam, where the wrap's
 * `+ 2*PI` re-addition rounds an input distinctly below 2*PI back up to
 * exactly 2*PI in double precision, landing on bin 0 rather than the last
 * bin a naive `angle < 2*PI` model expects (see this file's test).
 */
export function ismMapAzIndexForAngle(angle: number, az: number): number {
  const wrapped = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(az - 1, Math.floor((wrapped / (2 * Math.PI)) * az));
}
