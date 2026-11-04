/**
 * DownloadStatus — the data download in words, a line of progress and, while it runs, what is left.
 * A problem is an alert with its fix in the words; the bar keeps how far the download got.
 */

import type { ReactNode } from 'react';
import AlertIcon from '../../../../../../../src/components/icons/AlertIcon/AlertIcon';
import CheckIcon from '../../../../../../../src/components/icons/CheckIcon/CheckIcon';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { SyncProgress } from '../../../../@types/SyncProgress';
import { controlStatusText } from '../../utils/controlStatusText';
import { needsRetry } from '../../utils/needsRetry';
import { syncProgressDetail } from '../../utils/syncProgressDetail';
import { useSecondsLeft } from './useSecondsLeft';
import chrome from '../../../controlChrome.module.css';
import styles from './DownloadStatus.module.css';

export type DownloadStatusProps = {
  readonly status: ControlStatus;
  readonly progress: SyncProgress | null;
  readonly skyRunning: boolean;
};

function DownloadStatus({ status, progress, skyRunning }: DownloadStatusProps): ReactNode {
  const secondsLeft = useSecondsLeft(progress);
  const problem = needsRetry(status);
  const fraction = progress
    ? Math.min(1, progress.doneBytes / Math.max(progress.totalBytes, 1))
    : 0;
  const complete = status.kind === 'idle' && fraction === 1;
  return (
    <div className={styles.root}>
      {progress && (
        <div
          className={styles.track}
          role="progressbar"
          aria-label="Download progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
        >
          <div
            className={problem ? styles.fillStopped : styles.fill}
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      )}
      <div className={styles.line}>
        {problem && <AlertIcon size={18} />}
        {complete && <CheckIcon size={18} />}
        <p className={styles.text} role={problem ? 'alert' : 'status'}>
          {controlStatusText(status, progress, skyRunning)}
        </p>
        {status.kind === 'syncing' && progress && (
          <p className={chrome.dim}>
            <span className={styles.figures}>{syncProgressDetail(progress, secondsLeft)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default DownloadStatus;
