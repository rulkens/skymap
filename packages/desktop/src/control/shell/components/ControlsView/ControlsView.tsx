/**
 * ControlsView — the everyday window after setup: the data, the setup choices, tablets, and Quit. Two
 * columns when there is room, the data first, since it is what changes on its own.
 */

import type { ReactNode } from 'react';
import type { ControlBridge } from '../../../../@types/ControlBridge';
import type { ControlSession } from '../../@types/ControlSession';
import PairingPanel from '../../../pairing/components/PairingPanel/PairingPanel';
import QuitPanel from '../QuitPanel/QuitPanel';
import SetupPanel from '../../../setup/components/SetupPanel/SetupPanel';
import SyncPanel from '../../../sync/components/SyncPanel/SyncPanel';
import styles from './ControlsView.module.css';

export type ControlsViewProps = {
  readonly session: ControlSession;
  readonly bridge: ControlBridge;
  readonly onRunSetup: () => void;
  readonly onHelp: () => void;
};

function ControlsView({ session, bridge, onRunSetup, onHelp }: ControlsViewProps): ReactNode {
  const { setup, save } = session;
  return (
    <main className={styles.root}>
      <div className={styles.column}>
        <SyncPanel sync={session} onUpdateNow={bridge.updateNow} onRestartSky={bridge.restartSky} />
        <SetupPanel
          setup={setup}
          displays={session.displays}
          saveState={session.saveState}
          testGrid={session.testGrid}
          onSave={(next) => void save(next)}
          onShowTestGrid={bridge.showTestGrid}
          onRunSetup={onRunSetup}
        />
      </div>
      <div className={styles.column}>
        <PairingPanel
          room={session.room}
          networks={session.networks}
          network={setup.network}
          skyRunning={session.skyRunning}
          onPickNetwork={(network) => void save({ ...setup, network })}
          onRotate={bridge.rotateCode}
          onHelp={onHelp}
        />
        <QuitPanel onQuit={bridge.quit} />
      </div>
    </main>
  );
}

export default ControlsView;
