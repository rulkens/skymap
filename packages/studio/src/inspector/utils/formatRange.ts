/** A row's time range for the head: `7.0–11.0 s`, `8.0 s` for an instant, undefined while unresolved. */
export function formatRange(startSec: number | null, endSec: number | null): string | undefined {
  if (startSec === null || endSec === null) return undefined;
  const start = startSec.toFixed(1);
  const end = endSec.toFixed(1);
  return start === end ? `${start} s` : `${start}–${end} s`;
}
