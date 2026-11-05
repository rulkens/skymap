/** `YYYY-MM-DD` of an ISO instant; day-precision events (stored at 00:00 UTC) show nothing more. */
export function formatEventDate(iso: string): string {
  return iso.slice(0, 10);
}
