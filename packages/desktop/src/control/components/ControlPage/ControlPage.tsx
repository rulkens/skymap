/**
 * ControlPage — the control window: data sync, setup, remote pairing and quit. The main process
 * owns every value here; the page shows its latest word and sends the person's changes back.
 */

import type { ReactNode } from 'react';
import type { ControlBridge } from '../../../@types/ControlBridge';
import { useControlBridge } from './useControlBridge';
import SyncPanel from '../SyncPanel/SyncPanel';
import SetupPanel from '../SetupPanel/SetupPanel';
import PairingPanel from '../PairingPanel/PairingPanel';
import QuitPanel from '../QuitPanel/QuitPanel';
import styles from './ControlPage.module.css';

export type ControlPageProps = {
  readonly bridge: ControlBridge;
};

function ControlPage({ bridge }: ControlPageProps): ReactNode {
  const { status, progress, room, setup, displays, networks, saveState, save } =
    useControlBridge(bridge);
  return (
    <main className={styles.root}>
      <SyncPanel
        status={status}
        progress={progress}
        onUpdateNow={bridge.updateNow}
        onRestartSky={bridge.restartSky}
      />
      {setup && (
        <>
          <SetupPanel
            setup={setup}
            displays={displays}
            saveState={saveState}
            onSave={save}
            onShowTestGrid={bridge.showTestGrid}
          />
          <PairingPanel
            room={room}
            networks={networks}
            network={setup.network}
            onPickNetwork={(network) => save({ ...setup, network })}
            onRotate={bridge.rotateCode}
          />
        </>
      )}
      <QuitPanel onQuit={bridge.quit} />
    </main>
  );
}

export default ControlPage;
