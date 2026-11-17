/** An instant as the app's clock reads it: `2033-03-14 21:00 UTC`, to the minute. */
export function clockReading(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
