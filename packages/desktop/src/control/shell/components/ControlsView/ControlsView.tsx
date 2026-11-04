/**
 * ControlsView — the everyday window after setup: the data, the setup choices, tablets, and Quit. Two
 * columns when there is room, the data first, since it is what changes on its own.
 */

import type { ReactNode } from 'react';
import type { ControlSession } from '../../@types/ControlSession';
import PairingPanel from '../../../pairing/components/PairingPanel/PairingPanel';
import QuitPanel from '../QuitPanel/QuitPanel';
import SetupPanel from '../../../setup/components/SetupPanel/SetupPanel';
import SyncPanel from '../../../sync/components/SyncPanel/SyncPanel';
import styles from './ControlsView.module.css';

export type ControlsViewProps = {
  readonly session: ControlSession;
  readonly onUpdateNow: () => void;
  readonly onRestartSky: () => void;
  readonly onShowTestGrid: (on: boolean) => void;
  readonly onRotate: () => Promise<void>;
  readonly onQuit: () => void;
  readonly onRunSetup: () => void;
  readonly onHelp: () => void;
};

function ControlsView(props: ControlsViewProps): ReactNode {
  const { session, onUpdateNow, onRestartSky, onShowTestGrid, onRotate, onQuit } = props;
  const { setup, save } = session;
  return (
    <main className={styles.root}>
      <div className={styles.column}>
        <SyncPanel sync={session} onUpdateNow={onUpdateNow} onRestartSky={onRestartSky} />
        <SetupPanel
          setup={setup}
          displays={session.displays}
          placement={session.placement}
          saveState={session.saveState}
          testGrid={session.testGrid}
          onSave={(next) => void save(next)}
          onShowTestGrid={onShowTestGrid}
          onRunSetup={props.onRunSetup}
        />
      </div>
      <div className={styles.column}>
        <PairingPanel
          room={session.room}
          networks={session.networks}
          network={setup.network}
          skyRunning={session.skyRunning}
          onPickNetwork={(network) => void save({ ...setup, network })}
          onRotate={onRotate}
          onHelp={props.onHelp}
        />
        <QuitPanel onQuit={onQuit} />
      </div>
    </main>
  );
}

export default ControlsView;
