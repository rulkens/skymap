/** TabletStep — pairing during setup; nothing here has to be finished, so Next is also "later". */

import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { LanInterface } from '../../../../@types/LanInterface';
import NetworkChoice from '../../../pairing/components/NetworkChoice/NetworkChoice';
import PairingDetails from '../../../pairing/components/PairingDetails/PairingDetails';
import chrome from '../../../controlChrome.module.css';
import styles from './TabletStep.module.css';

export type TabletStepProps = {
  readonly setup: InstallSetup;
  readonly room: RelayRoom;
  readonly networks: readonly LanInterface[];
  readonly skyRunning: boolean;
  readonly onSave: (next: InstallSetup) => Promise<void>;
  readonly onHelp: () => void;
};

function TabletStep({
  setup,
  room,
  networks,
  skyRunning,
  onSave,
  onHelp,
}: TabletStepProps): ReactNode {
  return (
    <div className={styles.root}>
      <NetworkChoice
        networks={networks}
        network={setup.network}
        onPick={(network) => void onSave({ ...setup, network })}
      />
      <PairingDetails
        room={room}
        online={networks.length > 0}
        skyRunning={skyRunning}
        onHelp={onHelp}
      />
      <p className={chrome.dim}>No tablet at hand? Pair one later from the controls.</p>
    </div>
  );
}

export default TabletStep;
