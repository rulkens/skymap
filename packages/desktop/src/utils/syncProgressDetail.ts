import type { SyncProgress } from '../@types/SyncProgress';
import { formatGigabytes } from './formatGigabytes';

export function syncProgressDetail({ doneBytes, totalBytes, group }: SyncProgress): string {
  const percent = Math.round((doneBytes / Math.max(totalBytes, 1)) * 100);
  return `${group} · ${formatGigabytes(doneBytes)} of ${formatGigabytes(totalBytes)} · ${percent}%`;
}
