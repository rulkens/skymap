/**
 * PairingDetails — how a tablet joins: one QR, large enough to scan at arm's length, opening the
 * tablet setup page, which walks the tablet through its certificate and on to the remote. The code in
 * fours is for a tablet without a camera. The room is known before the sky runs, so the certificate
 * step can happen during the first download; joining waits for the sky.
 */

import type { ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import AlertIcon from '../../../../../../../src/components/icons/AlertIcon/AlertIcon';
import { groupedCode } from '../../utils/groupedCode';
import { tabletSetupUrl } from '../../utils/tabletSetupUrl';
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
  const url = tabletSetupUrl(room.origin, room.code);
  const typed = url.slice(0, url.indexOf('#'));
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
            Scan the QR with the tablet&apos;s camera. No camera? Open <UrlText url={typed} /> and
            type the code.
          </li>
          <li>
            Follow the steps on the tablet: it installs a certificate once, so it trusts this
            computer, then opens the remote.{' '}
            <button type="button" className={chrome.link} onClick={onHelp}>
              Help with tablets
            </button>
          </li>
          <li>If this computer asks to accept incoming network connections, choose Allow.</li>
        </ol>
        {!skyRunning && <p className={chrome.dim}>The tablet connects once Skymap is running.</p>}
      </div>
    </div>
  );
}

export default PairingDetails;
