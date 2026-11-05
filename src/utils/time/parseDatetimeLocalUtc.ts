/**
 * A `datetime-local` value's digits read as UTC, the inverse of `toDatetimeLocalUtc`; null for an
 * empty or malformed value, so a blank field never commits an Invalid Date.
 */

export function parseDatetimeLocalUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)),
  );
}
