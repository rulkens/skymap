/**
 * PairingDetails — how a tablet joins: the QR large enough to scan at arm's length, the code in fours,
 * and the three things a tablet needs once, in the order it needs them. The room is known before the
 * sky runs, so the certificate step can happen during the first download; joining waits for the sky.
 */

import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import { pairingUrl } from '../../../../../../../src/utils/remote/pairingUrl';
import AlertIcon from '../../../../../../../src/components/icons/AlertIcon/AlertIcon';
import { groupedCode } from '../../utils/groupedCode';
import PairingQr from '../PairingQr/PairingQr';
import UrlText from '../UrlText/UrlText';
import chrome from '../../../controlChrome.module.css';
import styles from './PairingDetails.module.css';

export type PairingDetailsProps = {
  readonly room: RelayRoom;
  readonly online: boolean;
  readonly skyRunning: boolean;
  readonly onHelp: () => void;
  /** A smaller QR, for the controls' panel. */
  readonly compact?: boolean;
};

function PairingDetails({
  room,
  online,
  skyRunning,
  onHelp,
  compact = false,
}: PairingDetailsProps): ReactNode {
  if (!online) {
    return (
      <p className={styles.offline} role="status">
        <AlertIcon size={18} />
        This computer is not on a network. Connect it to the network the tablets use, and the code
        appears here.
      </p>
    );
  }
  const url = pairingUrl(room.origin, room.code);
  return (
    <div className={styles.root}>
      <div className={styles.code}>
        <PairingQr text={url} compact={compact} />
        <p className={styles.room}>
          <span className={chrome.dim}>Code</span>
          <span className={styles.digits}>{groupedCode(room.code)}</span>
        </p>
      </div>
      <div className={styles.how}>
        <ol className={styles.steps}>
          <li>
            On the tablet, open <UrlText url={`${room.origin}/ca.crt`} /> and install it: a
            certificate, the file that lets the tablet trust this computer. Go past the warning this
            once.{' '}
            <button type="button" className={chrome.link} onClick={onHelp}>
              Steps for iPad and Android
            </button>
          </li>
          <li>
            Scan the code with the tablet&apos;s camera, or open <UrlText url={url} />.
          </li>
          <li>If this computer asks to accept incoming network connections, choose Allow.</li>
        </ol>
        {!skyRunning && <p className={chrome.dim}>The tablet connects once the sky is running.</p>}
      </div>
    </div>
  );
}

export default PairingDetails;
