/** neverRises — whether a fixed-declination target stays below the horizon at a latitude, all day, every day. */

export function neverRises(declinationRad: number, latitudeRad: number): boolean {
  // The upper transit reaches altitude 90° − |φ − δ|; below zero when the gap passes 90°.
  return Math.abs(latitudeRad - declinationRad) > Math.PI / 2;
}
