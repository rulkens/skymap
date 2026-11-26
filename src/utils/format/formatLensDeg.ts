/** A lens's vertical field: degrees down to 1°, arcminutes below; whole from 10, tenths under it. */
export function formatLensDeg(deg: number): string {
  const [value, unit] = deg < 1 ? [deg * 60, '′'] : [deg, '°'];
  return `${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}${unit}`;
}
