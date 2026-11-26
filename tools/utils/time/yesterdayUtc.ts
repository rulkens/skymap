const MS_PER_DAY = 86_400_000;

/** The UTC day before `now` as YYYY-MM-DD: the latest complete day, the one the cloud bake makes. */
export function yesterdayUtc(now: Date): string {
  return new Date(now.getTime() - MS_PER_DAY).toISOString().slice(0, 10);
}
