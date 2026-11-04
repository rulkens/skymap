/**
 * DownloadStrip — the download under every setup step, so the waiting time is setup time. It offers
 * Retry only when the sky lacks data it needs; otherwise there is nothing to do but carry on.
 */

import type { ReactNode } from 'react';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { SyncProgress } from '../../../../@types/SyncProgress';
import { needsRetry } from '../../utils/needsRetry';
import DownloadStatus from '../DownloadStatus/DownloadStatus';
import chrome from '../../../controlChrome.module.css';
import styles from './DownloadStrip.module.css';

export type DownloadStripProps = {
  readonly status: ControlStatus;
  readonly progress: SyncProgress | null;
  readonly skyRunning: boolean;
  readonly onRetry: () => void;
};

function DownloadStrip({ status, progress, skyRunning, onRetry }: DownloadStripProps): ReactNode {
  return (
    <footer className={styles.root} aria-label="Download">
      <DownloadStatus status={status} progress={progress} skyRunning={skyRunning} />
      {needsRetry(status) && (
        <button type="button" className={chrome.button} onClick={onRetry}>
          Retry
        </button>
      )}
    </footer>
  );
}

export default DownloadStrip;
