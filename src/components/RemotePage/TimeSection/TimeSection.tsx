/**
 * TimeSection — the Time sheet, mirroring the app's time bar: the clock ticking on the phone, its
 * state in words, Slower / Pause / Faster, the speed list and Reverse, a date to jump to, and back
 * to now while off real time. Middle button reads "Pause" but is named "Pause time", apart from
 * the tour's Pause.
 */

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';
import ChevronLeftIcon from '../../icons/ChevronLeftIcon/ChevronLeftIcon';
import ChevronRightIcon from '../../icons/ChevronRightIcon/ChevronRightIcon';
import LiveIcon from '../../icons/LiveIcon/LiveIcon';
import PauseIcon from '../../icons/PauseIcon/PauseIcon';
import PlayIcon from '../../icons/PlayIcon/PlayIcon';
import ReverseIcon from '../../icons/ReverseIcon/ReverseIcon';
import SpeedList from '../SpeedList/SpeedList';
import DateTimeField from '../DateTimeField/DateTimeField';
import { useSimInstant } from '../../../hooks/useSimInstant';
import { RATE_LADDER } from '../../../data/time/rateLadder';
import { formatSimClock } from '../../../utils/time/formatSimClock';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { TimeState } from '../../../@types/time/TimeState';
import controls from '../remoteControls.module.css';
import styles from './TimeSection.module.css';

export type TimeSectionProps = {
  readonly clock: TimeState;
  readonly onCommand: (command: RemoteCommand) => void;
};

function TimeSection({ clock, onCommand }: TimeSectionProps): ReactNode {
  const instant = useSimInstant(clock);
  const [speedsOpen, setSpeedsOpen] = useState(false);
  const speedButton = useRef<HTMLButtonElement>(null);
  const speedsId = useId();

  const { rateIndex, direction, paused } = clock;
  const rate = RATE_LADDER[rateIndex]?.label ?? '';
  const realTime = clock.mode === 'live' && !paused;
  const backward = direction === -1;
  const state = paused
    ? 'Paused'
    : realTime
      ? 'Real time'
      : `${rate}${backward ? ', backward' : ''}`;
  const readout = formatSimClock(instant);
  const zoneAt = readout.lastIndexOf(' ');

  const setRate = (index: number): void =>
    onCommand({ name: 'timeSetRate', payload: { rateIndex: index } });
  const closeSpeeds = (): void => {
    setSpeedsOpen(false);
    speedButton.current?.focus();
  };
  // Escape shuts the open list first; the sheet's own Escape handler sees it only after.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !speedsOpen) return;
    e.stopPropagation();
    closeSpeeds();
  };

  return (
    <div className={cx(controls.stack, styles.root)} onKeyDown={onKeyDown}>
      <div>
        <p className={styles.readout}>
          {readout.slice(0, zoneAt)}
          <span className={styles.zone}>{readout.slice(zoneAt + 1)}</span>
        </p>
        <p role="status" className={styles.state}>
          <span className={cx(styles.dot, realTime && styles.live)} aria-hidden="true" />
          {state}
        </p>
      </div>
      <div className={styles.transport}>
        <button
          type="button"
          className={cx(controls.button, styles.choice)}
          disabled={rateIndex <= 0}
          onClick={() => setRate(rateIndex - 1)}
        >
          <ChevronLeftIcon size={20} />
          Slower
        </button>
        <button
          type="button"
          className={cx(controls.button, styles.choice, styles.primary)}
          aria-label={paused ? 'Play time' : 'Pause time'}
          onClick={() => onCommand({ name: paused ? 'timeResume' : 'timePause', payload: null })}
        >
          {paused ? <PlayIcon size={20} /> : <PauseIcon size={20} />}
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className={cx(controls.button, styles.choice)}
          disabled={rateIndex >= RATE_LADDER.length - 1}
          onClick={() => setRate(rateIndex + 1)}
        >
          Faster
          <ChevronRightIcon size={20} />
        </button>
      </div>
      <div className={styles.pair}>
        <button
          ref={speedButton}
          type="button"
          className={cx(controls.button, styles.choice)}
          aria-label={`Speed ${rate}`}
          aria-expanded={speedsOpen}
          aria-controls={speedsOpen ? speedsId : undefined}
          onClick={() => setSpeedsOpen((open) => !open)}
        >
          {rate}
          <span aria-hidden="true">{speedsOpen ? '▴' : '▾'}</span>
        </button>
        <button
          type="button"
          className={cx(controls.button, styles.choice, backward && controls.on)}
          aria-pressed={backward}
          onClick={() =>
            onCommand({ name: 'timeSetDirection', payload: { direction: backward ? 1 : -1 } })
          }
        >
          <ReverseIcon size={20} />
          Reverse
        </button>
      </div>
      {speedsOpen && (
        <SpeedList
          id={speedsId}
          currentIndex={rateIndex}
          onPick={(index) => {
            setRate(index);
            closeSpeeds();
          }}
        />
      )}
      <DateTimeField
        instant={instant}
        onSet={(at) =>
          onCommand({ name: 'timeSetDate', payload: { simDays: unixMsToJulianDays(at.getTime()) } })
        }
      />
      {!realTime && (
        <button
          type="button"
          className={cx(controls.button, styles.choice)}
          onClick={() => onCommand({ name: 'timeGoLive', payload: null })}
        >
          <LiveIcon size={20} />
          Back to now
        </button>
      )}
    </div>
  );
}

export default TimeSection;
