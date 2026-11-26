/** Ruler head and readout time: `7.4 s` below a minute, `1:47.5` from a minute on. */
const TENTHS_PER_MINUTE = 600;

export function formatTimecode(sec: number): string {
  // Whole tenths first, so 59.96 carries to `1:00.0` instead of printing `60.0 s`.
  const tenths = Math.round(sec * 10);
  if (tenths < TENTHS_PER_MINUTE) return `${(tenths / 10).toFixed(1)} s`;
  const minutes = Math.floor(tenths / TENTHS_PER_MINUTE);
  const rest = tenths % TENTHS_PER_MINUTE;
  const seconds = String(Math.floor(rest / 10)).padStart(2, '0');
  return `${minutes}:${seconds}.${rest % 10}`;
}
