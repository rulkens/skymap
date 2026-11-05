/** An ISO date (`2026-10-06`) as the house style writes it: `6 October 2026`, no ordinal. Read as UTC so the day never shifts with the builder's time zone. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
