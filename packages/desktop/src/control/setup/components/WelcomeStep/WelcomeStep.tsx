/** WelcomeStep — what happens now: one download, then no internet; the download is already under way. */

import type { ReactNode } from 'react';
import type { SyncState } from '../../../sync/@types/SyncState';
import { formatGigabytes } from '../../../sync/utils/formatGigabytes';
import chrome from '../../../controlChrome.module.css';
import styles from './WelcomeStep.module.css';

export type WelcomeStepProps = {
  readonly sync: SyncState;
};

function WelcomeStep({ sync }: WelcomeStepProps): ReactNode {
  const size = sync.progress ? `, ${formatGigabytes(sync.progress.totalBytes)}` : '';
  return (
    <div className={styles.root}>
      <p className={chrome.text}>
        {sync.skyRunning
          ? 'Its data is on this computer, so it runs with no internet.'
          : `It downloads its data once${size}, then runs with no internet.`}
      </p>
      {sync.status.kind === 'syncing' && (
        <p className={chrome.text}>The download has started: set up the screens while it runs.</p>
      )}
    </div>
  );
}

export default WelcomeStep;
