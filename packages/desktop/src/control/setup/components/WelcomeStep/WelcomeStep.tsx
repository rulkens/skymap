/** WelcomeStep — what happens now: one download, then no internet; the download is already under way. */

import type { ReactNode } from 'react';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { SyncProgress } from '../../../../@types/SyncProgress';
import { formatGigabytes } from '../../../sync/utils/formatGigabytes';
import chrome from '../../../controlChrome.module.css';
import styles from './WelcomeStep.module.css';

export type WelcomeStepProps = {
  readonly status: ControlStatus;
  readonly progress: SyncProgress | null;
  readonly skyRunning: boolean;
};

function WelcomeStep({ status, progress, skyRunning }: WelcomeStepProps): ReactNode {
  const size = progress ? `, ${formatGigabytes(progress.totalBytes)}` : '';
  return (
    <div className={styles.root}>
      <p className={chrome.text}>
        {skyRunning
          ? 'Its data is on this computer, so it runs with no internet.'
          : `It downloads its data once${size}, then runs with no internet.`}
      </p>
      {status.kind === 'syncing' && (
        <p className={chrome.text}>The download has started: set up the screens while it runs.</p>
      )}
    </div>
  );
}

export default WelcomeStep;
