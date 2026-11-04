/**
 * A `datetime-local` value, 'YYYY-MM-DDTHH:mm', from the instant's UTC fields: the field has no
 * zone of its own, so it shows the same wall clock as the UTC readout.
 */

const pad2 = (value: number): string => value.toString().padStart(2, '0');

export function toDatetimeLocalUtc(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  return `${year}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}
