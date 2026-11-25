import { useEffect } from 'react';
import { setRunning } from '../../state/sim/simSlice';
import { useAppStore } from '../../store/hooks';

/**
 * usePauseSimWhileOpen — the sim pauses while `open` and, at close, runs again
 * only if it was running when it opened, however it closes. A Load closes it
 * too, so the run state is back before the sim rebuild that load starts lands.
 * The run state is read from the store, not selected, so pausing does not
 * re-run this effect and resume at once.
 */
export function usePauseSimWhileOpen(open: boolean): void {
  const store = useAppStore();
  useEffect(() => {
    if (!open || !store.getState().sim.running) return;
    store.dispatch(setRunning(false));
    return () => void store.dispatch(setRunning(true));
  }, [open, store]);
}
