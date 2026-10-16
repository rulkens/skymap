import { useEffect, useState } from 'react';

/** Whether Shift is down: it lets the pointer through the capture layer, so text can be selected for a mark. */
export function useShiftHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const sync = (e: KeyboardEvent): void => setHeld(e.shiftKey);
    const release = (): void => setHeld(false);
    addEventListener('keydown', sync, true);
    addEventListener('keyup', sync, true);
    addEventListener('blur', release);
    return () => {
      removeEventListener('keydown', sync, true);
      removeEventListener('keyup', sync, true);
      removeEventListener('blur', release);
    };
  }, []);
  return held;
}
