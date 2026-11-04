import { useId } from 'react';
import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import type { LanInterface } from '../../../../@types/LanInterface';
import NetworkChoice from '../NetworkChoice/NetworkChoice';
import PairingDetails from '../PairingDetails/PairingDetails';
import chrome from '../../../controlChrome.module.css';
import styles from './PairingPanel.module.css';

export type PairingPanelProps = {
  readonly room: RelayRoom | null;
  readonly networks: readonly LanInterface[];
  /** The interface the pairing address uses; null → the first available. */
  readonly network: string | null;
  readonly skyRunning: boolean;
  readonly onPickNetwork: (network: string) => void;
  readonly onRotate: () => void;
  readonly onHelp: () => void;
};

function PairingPanel({
  room,
  networks,
  network,
  skyRunning,
  onPickNetwork,
  onRotate,
  onHelp,
}: PairingPanelProps): ReactNode {
  const titleId = useId();
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.heading}>
        Tablets
      </h2>
      <NetworkChoice networks={networks} network={network} onPick={onPickNetwork} />
      <PairingDetails
        room={room}
        online={networks.length > 0}
        skyRunning={skyRunning}
        onHelp={onHelp}
      />
      <p className={chrome.dim}>
        Give this computer a DHCP reservation on its network, so the address in a tablet&apos;s
        bookmark keeps working.
      </p>
      <div className={chrome.row}>
        <button type="button" className={chrome.button} onClick={onRotate}>
          Rotate code
        </button>
        <p className={chrome.dim}>Disconnects paired tablets and changes the address.</p>
      </div>
    </section>
  );
}

export default PairingPanel;
