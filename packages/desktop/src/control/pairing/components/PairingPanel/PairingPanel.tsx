/**
 * PairingPanel — the tablets: the network, how to pair, and Rotate code. Rotating disconnects every
 * tablet and breaks every bookmark, so it takes a second press on a button that says so; Escape or
 * leaving the button cancels, and the button stays busy until the new code arrives.
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import type { LanInterface } from '../../../../@types/LanInterface';
import NetworkChoice from '../NetworkChoice/NetworkChoice';
import PairingDetails from '../PairingDetails/PairingDetails';
import { ROTATE_HINT, ROTATE_LABEL } from './PairingPanel.constants';
import chrome from '../../../controlChrome.module.css';
import styles from './PairingPanel.module.css';

export type PairingPanelProps = {
  readonly room: RelayRoom;
  readonly networks: readonly LanInterface[];
  /** The interface the pairing address uses; null → the first available. */
  readonly network: string | null;
  readonly skyRunning: boolean;
  readonly onPickNetwork: (network: string) => void;
  /** Settles once main has stored and handed out the new code. */
  readonly onRotate: () => Promise<void>;
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
  const [rotate, setRotate] = useState<keyof typeof ROTATE_HINT>('idle');
  const press = (): void => {
    if (rotate === 'rotating') return;
    if (rotate !== 'confirm') return setRotate('confirm');
    setRotate('rotating');
    onRotate().then(
      () => setRotate('idle'),
      () => setRotate('failed'),
    );
  };
  const cancel = (): void => setRotate((now) => (now === 'confirm' ? 'idle' : now));
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
        compact
      />
      <p className={chrome.dim}>
        Give this computer a DHCP reservation on its network, so the address in a tablet&apos;s
        bookmark keeps working.
      </p>
      <div className={chrome.row}>
        {/* One button throughout, so focus stays on it from the first press to the new code. */}
        <button
          type="button"
          className={chrome.button}
          aria-disabled={rotate === 'rotating'}
          aria-busy={rotate === 'rotating'}
          onClick={press}
          onBlur={cancel}
          onKeyDown={(e) => e.key === 'Escape' && cancel()}
        >
          {ROTATE_LABEL[rotate]}
        </button>
        <p className={rotate === 'failed' ? chrome.text : chrome.dim} role="status">
          {ROTATE_HINT[rotate]}
        </p>
      </div>
    </section>
  );
}

export default PairingPanel;
