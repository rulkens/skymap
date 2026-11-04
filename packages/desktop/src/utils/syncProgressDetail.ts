import type { SyncProgress } from '../@types/SyncProgress';
import { formatGigabytes } from './formatGigabytes';
import { formatTimeLeft } from './formatTimeLeft';

/** "2.1 GB of 6.4 GB · 4.3 GB left, about 6 min"; the time only once a rate is known. */
export function syncProgressDetail(
  { doneBytes, totalBytes }: SyncProgress,
  secondsLeft: number | null,
): string {
  const left = `${formatGigabytes(Math.max(totalBytes - doneBytes, 0))} left`;
  const time = secondsLeft === null ? '' : `, ${formatTimeLeft(secondsLeft)}`;
  return `${formatGigabytes(doneBytes)} of ${formatGigabytes(totalBytes)} · ${left}${time}`;
}
