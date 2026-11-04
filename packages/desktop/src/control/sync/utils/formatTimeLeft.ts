/** A download's remaining time, rounded up to the minute a person plans by. */
export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  return `about ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
