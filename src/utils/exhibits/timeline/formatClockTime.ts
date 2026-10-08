/** A UTC instant's time of day as "14:02 UT". */
export function formatClockTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UT`;
}
