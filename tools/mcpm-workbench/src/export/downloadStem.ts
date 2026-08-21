/**
 * downloadStem — `mcpm-<yyyymmdd-hhmm>`, local time. One stem names both the
 * `.npy` and its `.json` sidecar so the download pair can never drift apart
 * (spec §8's "the download button enforces" note).
 */
export function downloadStem(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `mcpm-${yyyy}${mm}${dd}-${hh}${min}`;
}
