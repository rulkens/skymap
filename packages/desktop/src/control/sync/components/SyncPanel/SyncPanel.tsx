import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { SyncProgress } from '../../../../@types/SyncProgress';
import { needsRetry } from '../../utils/needsRetry';
import DownloadStatus from '../DownloadStatus/DownloadStatus';
import chrome from '../../../controlChrome.module.css';
import styles from './SyncPanel.module.css';

export type SyncPanelProps = {
  readonly status: ControlStatus;
  readonly progress: SyncProgress | null;
  readonly skyRunning: boolean;
  readonly onUpdateNow: () => void;
  readonly onRestartSky: () => void;
};

function SyncPanel({
  status,
  progress,
  skyRunning,
  onUpdateNow,
  onRestartSky,
}: SyncPanelProps): ReactNode {
  const titleId = useId();
  const syncing = status.kind === 'syncing';
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.heading}>
        Data
      </h2>
      <DownloadStatus status={status} progress={progress} skyRunning={skyRunning} />
      <div className={chrome.row}>
        <button type="button" className={chrome.button} disabled={syncing} onClick={onUpdateNow}>
          {needsRetry(status) ? 'Retry' : 'Update now'}
        </button>
        <button type="button" className={chrome.button} disabled={syncing} onClick={onRestartSky}>
          Restart sky
        </button>
      </div>
      <p className={chrome.dim}>
        Restart sky loads new data and removes the files it no longer uses.
      </p>
    </section>
  );
}

export default SyncPanel;
