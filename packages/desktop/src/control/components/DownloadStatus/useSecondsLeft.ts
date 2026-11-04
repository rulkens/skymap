import { useEffect, useRef, useState } from 'react';
import type { SyncProgress } from '../../../@types/SyncProgress';

// Under this the rate swings with each file's start, and an estimate would jump about.
const MIN_SAMPLE_MS = 5000;

/** Seconds left at the average rate since this download started; null until a fair sample exists. */
export function useSecondsLeft(progress: SyncProgress | null): number | null {
  const first = useRef<{ at: number; done: number; total: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (progress === null) return;
    const now = performance.now();
    const start = first.current;
    if (start === null || start.total !== progress.totalBytes || progress.doneBytes < start.done) {
      first.current = { at: now, done: progress.doneBytes, total: progress.totalBytes };
      setSecondsLeft(null);
      return;
    }
    const elapsed = now - start.at;
    const perMs = (progress.doneBytes - start.done) / elapsed;
    if (elapsed < MIN_SAMPLE_MS || perMs <= 0) return;
    setSecondsLeft((progress.totalBytes - progress.doneBytes) / perMs / 1000);
  }, [progress]);
  return secondsLeft;
}
