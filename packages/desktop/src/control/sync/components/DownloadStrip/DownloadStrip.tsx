/**
 * DownloadStrip — the download under every setup step, so the waiting time is setup time. It offers
 * Retry only when the sky lacks data it needs; otherwise there is nothing to do but carry on.
 */

import type { ReactNode } from 'react';
import type { SyncState } from '../../@types/SyncState';
import { describeStatus } from '../../utils/describeStatus';
import DownloadStatus from '../DownloadStatus/DownloadStatus';
import chrome from '../../../controlChrome.module.css';
import styles from './DownloadStrip.module.css';

export type DownloadStripProps = {
  readonly sync: SyncState;
  readonly onRetry: () => void;
};

function DownloadStrip({ sync, onRetry }: DownloadStripProps): ReactNode {
  return (
    <footer className={styles.root} aria-label="Download">
      <DownloadStatus sync={sync} />
      {describeStatus(sync).tone === 'problem' && (
        <button type="button" className={chrome.button} onClick={onRetry}>
          Retry
        </button>
      )}
    </footer>
  );
}

export default DownloadStrip;
