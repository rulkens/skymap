/**
 * useControlBridge — the main process as React state. Main pushes the status, the sky and the pairing
 * room once, as the page finishes loading, so the listeners must be attached by then: main.tsx renders
 * synchronously for that reason. The rest is read once; displays are pushed again as they come and go.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import type { ControlBridge } from '../../../../@types/ControlBridge';
import type { ControlSession } from '../../@types/ControlSession';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { DisplayInfo } from '../../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { LanInterface } from '../../../../@types/LanInterface';
import type { SetupSaveState } from '../../../setup/@types/SetupSaveState';
import type { SyncProgress } from '../../../../@types/SyncProgress';

export function useControlBridge(bridge: ControlBridge): ControlSession {
  const [status, setStatus] = useState<ControlStatus>({ kind: 'idle' });
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [skyRunning, setSkyRunning] = useState(false);
  const [testGrid, setTestGrid] = useState(false);
  const [room, setRoom] = useState<RelayRoom | null>(null);
  const [setup, setSetup] = useState<InstallSetup | null>(null);
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [displays, setDisplays] = useState<readonly DisplayInfo[]>([]);
  const [networks, setNetworks] = useState<readonly LanInterface[]>([]);
  const [saveState, setSaveState] = useState<SetupSaveState>('idle');

  useEffect(() => {
    const offs = [
      bridge.onStatus(setStatus),
      bridge.onSync(setProgress),
      bridge.onSky(setSkyRunning),
      bridge.onTestGrid(setTestGrid),
      bridge.onPairing(setRoom),
      bridge.onDisplays(setDisplays),
    ];
    return () => offs.forEach((off) => off());
  }, [bridge]);

  useEffect(() => {
    let live = true;
    void Promise.all([
      bridge.getSetup(),
      bridge.isFirstRun(),
      bridge.listDisplays(),
      bridge.listNetworks(),
    ]).then(([storedSetup, isFirst, displayList, networkList]) => {
      if (!live) return;
      setSetup(storedSetup);
      setFirstRun(isFirst);
      setDisplays(displayList);
      setNetworks(networkList);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  const save = useCallback(
    async (next: InstallSetup): Promise<void> => {
      setSetup(next);
      setSaveState('saving');
      await bridge.saveSetup(next);
      setSaveState('saved');
    },
    [bridge],
  );

  return {
    status,
    progress,
    skyRunning,
    testGrid,
    room,
    setup,
    firstRun,
    displays,
    networks,
    saveState,
    save,
  };
}
