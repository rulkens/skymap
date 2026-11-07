/** The next local `at` ('HH:MM') strictly after `now`: today if still ahead, else tomorrow. */
export function nextDailyRun(at: string, now: Date): Date {
  const [hours = 0, minutes = 0] = at.split(':').map(Number);
  const run = new Date(now);
  run.setHours(hours, minutes, 0, 0);
  // setDate keeps the local wall-clock time across a DST change, unlike adding 24 h.
  if (run <= now) run.setDate(run.getDate() + 1);
  return run;
}
