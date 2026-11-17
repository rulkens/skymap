import { useCallback, useEffect, useState } from 'react';
import type { ControlBridge } from '../../../../@types/ControlBridge';
import type { ControlSession } from '../../@types/ControlSession';
import type { ControlState } from '../../../../@types/ControlState';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { SetupSaveState } from '../../../setup/@types/SetupSaveState';

/** Main's state as React state: read once, then replaced by every push; null until the first arrives. */
export function useControlBridge(bridge: ControlBridge): ControlSession | null {
  const [state, setState] = useState<ControlState | null>(null);
  // Shown until main's state carries it, so a pick answers at once.
  const [pending, setPending] = useState<InstallSetup | null>(null);
  const [saveState, setSaveState] = useState<SetupSaveState>('idle');

  useEffect(() => {
    let live = true;
    const off = bridge.onState((next) => live && setState(next));
    // A push that beat the read is the newer word.
    void bridge.getState().then((first) => live && setState((pushed) => pushed ?? first));
    return () => {
      live = false;
      off();
    };
  }, [bridge]);

  const save = useCallback(
    async (next: InstallSetup): Promise<void> => {
      setPending(next);
      setSaveState('saving');
      try {
        await bridge.saveSetup(next);
        setSaveState('saved');
      } catch {
        // Main kept the stored setup; dropping the draft shows it again.
        setSaveState('failed');
      } finally {
        setPending((shown) => (shown === next ? null : shown));
      }
    },
    [bridge],
  );

  if (state === null) return null;
  return { ...state, setup: pending ?? state.setup, saveState, save };
}
