/** TimeRow — the clock's state in words and its Pause time / Play time button; on the now card and atop the Time sheet. */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import { RATE_LADDER } from '../../../data/time/rateLadder';
import { simDaysToIsoDate } from '../../../utils/time/simDaysToIsoDate';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';
import styles from './TimeRow.module.css';

export type TimeRowProps = {
  readonly time: DomeStatus['time'];
  readonly onCommand: (command: RemoteCommand) => void;
};

function TimeRow({ time, onCommand }: TimeRowProps): ReactNode {
  return (
    <div className={styles.root}>
      <RemoteIcon glyph="time" />
      <p role="status" className={styles.text}>
        {time.mode === 'live' ? 'Live' : simDaysToIsoDate(time.simDays)}
        {time.paused
          ? ', paused'
          : `, ${time.direction === 1 ? '' : 'back '}${RATE_LADDER[time.rateIndex]?.label ?? ''}`}
      </p>
      <button
        type="button"
        className={cx(controls.button, styles.button)}
        onClick={() => onCommand({ name: time.paused ? 'timeResume' : 'timePause', payload: null })}
      >
        <RemoteIcon glyph={time.paused ? 'play' : 'pause'} />
        {time.paused ? 'Play time' : 'Pause time'}
      </button>
    </div>
  );
}

export default TimeRow;
