import { useId } from 'react';
import type { ReactNode } from 'react';
import type { SyncState } from '../../@types/SyncState';
import { describeStatus } from '../../utils/describeStatus';
import DownloadStatus from '../DownloadStatus/DownloadStatus';
import chrome from '../../../controlChrome.module.css';
import styles from './SyncPanel.module.css';

export type SyncPanelProps = {
  readonly sync: SyncState;
  readonly onUpdateNow: () => void;
  readonly onRestartSky: () => void;
};

function SyncPanel({ sync, onUpdateNow, onRestartSky }: SyncPanelProps): ReactNode {
  const titleId = useId();
  const syncing = sync.status.kind === 'syncing';
  const restartNote = sync.skyLoading
    ? 'Loading the sky'
    : sync.hasData
      ? 'Restart sky loads new data and removes the files it no longer uses.'
      : 'Restart sky needs the data: the sky starts by itself once it is downloaded.';
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.heading}>
        Data
      </h2>
      <DownloadStatus sync={sync} />
      <div className={chrome.row}>
        <button type="button" className={chrome.button} disabled={syncing} onClick={onUpdateNow}>
          {describeStatus(sync).tone === 'problem' ? 'Retry' : 'Update now'}
        </button>
        <button
          type="button"
          className={chrome.button}
          disabled={syncing || sync.skyLoading || !sync.hasData}
          onClick={onRestartSky}
        >
          Restart sky
        </button>
        <p className={styles.note} role="status">
          {restartNote}
        </p>
      </div>
    </section>
  );
}

export default SyncPanel;
