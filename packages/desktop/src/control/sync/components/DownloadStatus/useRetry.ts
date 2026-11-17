import { useCallback, useEffect, useState } from 'react';
import { MIN_TRYING_MS } from './useRetry.constants';

/**
 * A retry button's pending state: from the press until main reports a newer `lastAttempt`, and
 * never for less than MIN_TRYING_MS.
 */
export function useRetry(
  lastAttempt: number | null,
  onRetry: () => void,
): { trying: boolean; retry: () => void } {
  const [pressedAt, setPressedAt] = useState<{ lastAttempt: number | null } | null>(null);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(false), MIN_TRYING_MS);
    return () => clearTimeout(timer);
  }, [held, pressedAt]);
  const retry = useCallback(() => {
    setPressedAt({ lastAttempt });
    setHeld(true);
    onRetry();
  }, [lastAttempt, onRetry]);
  const trying = pressedAt !== null && (held || pressedAt.lastAttempt === lastAttempt);
  return { trying, retry };
}
