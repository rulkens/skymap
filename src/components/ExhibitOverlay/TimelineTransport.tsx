/**
 * TimelineTransport — the exhibit clock as one pill: previous event, run/pause, the sim date,
 * a slower/faster rate pair and next event. The time of day shows only on a ridden flyby;
 * while a ride profile drives the clock the rate slot reads its live speed instead of a detent.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';

import { formatClockDate } from '../../utils/exhibits/timeline/formatClockDate';
import { formatClockTime } from '../../utils/exhibits/timeline/formatClockTime';
import type { ExhibitTimelineClock } from '../../@types/exhibits/ExhibitTimelineClock';
import styles from './ExhibitTimeline.module.css';

export type TimelineTransportProps = {
  readonly simMs: number;
  readonly clock: ExhibitTimelineClock;
  /** Show the time of day under the date (a flyby is being ridden). */
  readonly showTime: boolean;
  readonly onPrev: (() => void) | null;
  readonly onNext: (() => void) | null;
  readonly onPlayPause: () => void;
  readonly onSlower: () => void;
  readonly onFaster: () => void;
};

function TimelineTransport({
  simMs,
  clock,
  showTime,
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
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3 2v12M14 2 6 8l8 6z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className={cx(styles.iconBtn, styles.playBtn)}
        aria-label={clock.paused ? 'Run the clock' : 'Pause the clock'}
        onClick={onPlayPause}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {clock.paused ? (
            <path d="M4 2.5v11L13.5 8z" fill="currentColor" />
          ) : (
            <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
          )}
        </svg>
      </button>
      <div className={styles.when}>
        <span className={styles.whenDate}>{formatClockDate(simMs)}</span>
        {showTime ? <span className={styles.whenTime}>{formatClockTime(simMs)}</span> : null}
      </div>
      <div className={styles.rate}>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.rateBtn)}
          aria-label="Slower"
          disabled={clock.atSlowest}
          onClick={onSlower}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <b className={styles.rateLabel}>
          {clock.riding ? <i className={styles.pulse} /> : null}
          {clock.rateLabel}
        </b>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.rateBtn)}
          aria-label="Faster"
          disabled={clock.atFastest}
          onClick={onFaster}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M1.5 5h7M5 1.5v7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="Next event"
        disabled={!onNext}
        onClick={onNext ?? undefined}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13 2v12M2 2l8 6-8 6z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export default TimelineTransport;
