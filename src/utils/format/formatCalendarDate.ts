/** An ISO calendar day ('2017-08-17') as '17 Aug 2017'. */
export function formatCalendarDate(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
