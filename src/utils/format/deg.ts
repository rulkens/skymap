/** Radians to a one-decimal degree readout; em-dash for an absent value. */
const RAD_TO_DEG = 180 / Math.PI;

export function deg(rad: number | null): string {
  return rad === null ? '—' : `${(rad * RAD_TO_DEG).toFixed(1)}°`;
}
