import { useId } from 'react';
import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../src/@types/remote/RelayRoom';
import { pairingUrl } from '../../../../../../src/utils/remote/pairingUrl';
import type { LanInterface } from '../../../@types/LanInterface';
import PairingQr from '../PairingQr/PairingQr';
import chrome from '../controlChrome.module.css';
import styles from './PairingPanel.module.css';

export type PairingPanelProps = {
  /** null until the sky has started and the relay issued a room. */
  readonly room: RelayRoom | null;
  readonly networks: readonly LanInterface[];
  /** The interface the pairing address uses; null → the first available. */
  readonly network: string | null;
  readonly onPickNetwork: (network: string | null) => void;
  readonly onRotate: () => void;
};

function PairingPanel({
  room,
  networks,
  network,
  onPickNetwork,
  onRotate,
}: PairingPanelProps): ReactNode {
  const titleId = useId();
  const url = room && pairingUrl(room.origin, room.code);
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.title}>
        Remote pairing
      </h2>
      <p className={styles.note}>
        On first launch the computer asks to accept incoming network connections. Choose Allow, or
        phones and tablets cannot connect.
      </p>
      {room && url ? (
        <div>
          <PairingQr text={url} />
          <p className={chrome.text}>
            Code <strong className={styles.code}>{room.code}</strong>
          </p>
          <p className={chrome.dim}>{url}</p>
          <p className={chrome.dim}>
            Tablets: open {room.origin}/ca.crt once to trust this computer&apos;s certificate.
          </p>
        </div>
      ) : (
        <p className={chrome.dim}>The code appears once the sky has started.</p>
      )}
      <label className={chrome.field}>
        Network
        <select
          className={chrome.control}
          value={network ?? ''}
          onChange={(e) => onPickNetwork(e.target.value || null)}
        >
          <option value="">First available</option>
          {networks.map(({ name, address }) => (
            <option key={name} value={name}>
              {name} · {address}
            </option>
          ))}
        </select>
      </label>
      <p className={chrome.dim}>
        Give this network a DHCP reservation so tablet bookmarks keep working.
      </p>
      <div className={chrome.row}>
        <button type="button" className={chrome.button} onClick={onRotate}>
          Rotate code
        </button>
      </div>
      <p className={chrome.dim}>
        Rotating disconnects paired remotes and changes the bookmark address.
      </p>
    </section>
  );
}

export default PairingPanel;
