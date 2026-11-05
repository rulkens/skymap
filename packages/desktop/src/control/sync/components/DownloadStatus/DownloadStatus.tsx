/**
 * DownloadStatus — the data download in words, a line of progress with its pause and resume button
 * and, while it runs, what is left. A problem is an alert with its fix in the words; the bar keeps
 * how far the download got.
 */

import type { ReactNode } from 'react';
import AlertIcon from '../../../../../../../src/components/icons/AlertIcon/AlertIcon';
import CheckIcon from '../../../../../../../src/components/icons/CheckIcon/CheckIcon';
import PauseIcon from '../../../../../../../src/components/icons/PauseIcon/PauseIcon';
import PlayIcon from '../../../../../../../src/components/icons/PlayIcon/PlayIcon';
import type { SyncState } from '../../@types/SyncState';
import { describeStatus } from '../../utils/describeStatus';
import { syncProgressDetail } from '../../utils/syncProgressDetail';
import { useSecondsLeft } from './useSecondsLeft';
import chrome from '../../../controlChrome.module.css';
import styles from './DownloadStatus.module.css';

export type DownloadStatusProps = {
  readonly sync: SyncState;
  readonly onPause: () => void;
  readonly onResume: () => void;
};

function DownloadStatus({ sync, onPause, onResume }: DownloadStatusProps): ReactNode {
  const { progress } = sync;
  const running = sync.status.kind === 'syncing';
  const paused = sync.status.kind === 'paused';
  const secondsLeft = useSecondsLeft(progress);
  const view = describeStatus(sync);
  const fraction = progress
    ? Math.min(1, progress.doneBytes / Math.max(progress.totalBytes, 1))
    : 0;
  return (
    <div className={styles.root}>
      {progress && (
        <div className={styles.bar}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
          >
            <div
              className={view.tone === 'problem' || paused ? styles.fillStopped : styles.fill}
              style={{ transform: `scaleX(${fraction})` }}
            />
          </div>
          {(running || paused) && (
            <button
              type="button"
              className={styles.toggle}
              aria-label={running ? 'Pause download' : 'Resume download'}
              onClick={running ? onPause : onResume}
            >
              {running ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </button>
          )}
        </div>
      )}
      <div className={styles.line}>
        {view.tone === 'problem' && <AlertIcon size={18} />}
        {view.tone === 'done' && <CheckIcon size={18} />}
        <p className={styles.text} role={view.tone === 'problem' ? 'alert' : 'status'}>
          {view.text}
        </p>
        {running && progress && (
          <p className={chrome.dim}>
            <span className={styles.figures}>{syncProgressDetail(progress, secondsLeft)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default DownloadStatus;
