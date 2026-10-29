/** LinkStatus — the link to the dome in words, with a mark whose shape changes too. */

import cx from 'classnames';
import type { ReactNode } from 'react';
import styles from './LinkStatus.module.css';

export type LinkStatusProps = {
  readonly state: 'connected' | 'looking' | 'lost';
};

const TEXT = {
  connected: 'Connected',
  looking: 'Looking for the dome',
  lost: 'Dome not there',
} as const;

function LinkStatus({ state }: LinkStatusProps): ReactNode {
  return (
    <span role="status" className={cx(styles.root, styles[state])}>
      <span className={styles.mark} aria-hidden="true" />
      {TEXT[state]}
    </span>
  );
}

export default LinkStatus;
