/**
 * TimelineTransport — the exhibit clock as one pill: previous event, run/pause, the sim date,
 * a slower/faster speed pair and next event. While a mission profile drives the clock the rate
 * slot reads its live speed, and the time of day shows once that is under a day per second.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';

import MinusIcon from '../../../components/icons/MinusIcon/MinusIcon';
import NextIcon from '../../../components/icons/NextIcon/NextIcon';
import PauseIcon from '../../../components/icons/PauseIcon/PauseIcon';
import PlayIcon from '../../../components/icons/PlayIcon/PlayIcon';
import PlusIcon from '../../../components/icons/PlusIcon/PlusIcon';
import PrevIcon from '../../../components/icons/PrevIcon/PrevIcon';

import { formatClockDate } from '../../../utils/exhibits/timeline/formatClockDate';
import { formatClockTime } from '../../../utils/exhibits/timeline/formatClockTime';
import type { ExhibitTimelineClock } from '../../../@types/exhibits/ExhibitTimelineClock';
import styles from './ExhibitTimeline.module.css';

export type TimelineTransportProps = {
  readonly simMs: number;
  readonly clock: ExhibitTimelineClock;
  readonly onPrev: (() => void) | null;
  readonly onNext: (() => void) | null;
  readonly onPlayPause: () => void;
  readonly onSlower: () => void;
  readonly onFaster: () => void;
};

function TimelineTransport({
  simMs,
  clock,
  onPrev,
  onNext,
  onPlayPause,
  onSlower,
  onFaster,
}: TimelineTransportProps): ReactNode {
  return (
    <div className={styles.transport}>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="Previous event"
        disabled={!onPrev}
        onClick={onPrev ?? undefined}
      >
        <PrevIcon size={18} />
      </button>
      <button
        type="button"
        className={cx(styles.iconBtn, styles.playBtn)}
        aria-label={clock.paused ? 'Run the clock' : 'Pause the clock'}
        onClick={onPlayPause}
      >
        {clock.paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
      </button>
      <div className={styles.when}>
        <span className={styles.whenDate}>{formatClockDate(simMs)}</span>
        {clock.showTime ? <span className={styles.whenTime}>{formatClockTime(simMs)}</span> : null}
      </div>
      <div className={styles.rate}>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.rateBtn)}
          aria-label="Slower"
          disabled={clock.atSlowest}
          onClick={onSlower}
        >
          <MinusIcon size={14} />
        </button>
        <b className={styles.rateLabel}>
          {clock.profiled ? <i className={styles.pulse} /> : null}
          {clock.rateLabel}
        </b>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.rateBtn)}
          aria-label="Faster"
          disabled={clock.atFastest}
          onClick={onFaster}
        >
          <PlusIcon size={14} />
        </button>
      </div>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="Next event"
        disabled={!onNext}
        onClick={onNext ?? undefined}
      >
        <NextIcon size={18} />
      </button>
    </div>
  );
}

export default TimelineTransport;
