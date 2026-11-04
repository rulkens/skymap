/**
 * useControlBridge — the main process as React state. Main pushes the status and the pairing room
 * once, as the page finishes loading, so the listeners must be attached by then: main.tsx renders
 * synchronously for that reason. Setup, displays and networks are read once.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RelayRoom } from '../../../../../../src/@types/remote/RelayRoom';
import type { ControlBridge } from '../../../@types/ControlBridge';
import type { ControlSession } from '../../../@types/ControlSession';
import type { ControlStatus } from '../../../@types/ControlStatus';
import type { DisplayInfo } from '../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { LanInterface } from '../../../@types/LanInterface';
import type { SetupSaveState } from '../../../@types/SetupSaveState';
import type { SyncProgress } from '../../../@types/SyncProgress';

export function useControlBridge(bridge: ControlBridge): ControlSession {
  const [status, setStatus] = useState<ControlStatus>({ kind: 'idle' });
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [room, setRoom] = useState<RelayRoom | null>(null);
  const [setup, setSetup] = useState<InstallSetup | null>(null);
  const [displays, setDisplays] = useState<readonly DisplayInfo[]>([]);
  const [networks, setNetworks] = useState<readonly LanInterface[]>([]);
  const [saveState, setSaveState] = useState<SetupSaveState>('idle');

  useEffect(() => {
    const offs = [
      bridge.onStatus(setStatus),
      bridge.onSync(setProgress),
      bridge.onPairing(setRoom),
    ];
    return () => offs.forEach((off) => off());
  }, [bridge]);

  useEffect(() => {
    let live = true;
    void Promise.all([bridge.getSetup(), bridge.listDisplays(), bridge.listNetworks()]).then(
      ([storedSetup, displayList, networkList]) => {
        if (!live) return;
        setSetup(storedSetup);
        setDisplays(displayList);
        setNetworks(networkList);
      },
    );
    return () => {
      live = false;
    };
  }, [bridge]);

  const save = useCallback(
    (next: InstallSetup): void => {
      setSetup(next);
      setSaveState('saving');
      void bridge.saveSetup(next).then(() => setSaveState('saved'));
    },
    [bridge],
  );

  return { status, progress, room, setup, displays, networks, saveState, save };
}
