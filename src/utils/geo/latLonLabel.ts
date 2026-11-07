/** latLonLabel — a point as "55.67° N 12.52° E", latitude first, the way a person reads it. */
export function latLonLabel(lonDeg: number, latDeg: number): string {
  const lat = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`;
  return `${lat} ${lon}`;
}
