/** TimeSection — the clock's row, then direction, speed, a date to jump to, and back to live. */

import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import TimeRow from '../TimeRow/TimeRow';
import { RATE_LADDER } from '../../../data/time/rateLadder';
import { simDaysToIsoDate } from '../../../utils/time/simDaysToIsoDate';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteGlyph } from '../../../@types/remote/RemoteGlyph';
import controls from '../remoteControls.module.css';
import styles from './TimeSection.module.css';

export type TimeSectionProps = {
  time: DomeStatus['time'];
  onCommand: (command: RemoteCommand) => void;
};

const DIRECTIONS: readonly { value: 1 | -1; label: string; glyph: RemoteGlyph }[] = [
  { value: -1, label: 'Backward', glyph: 'backward' },
  { value: 1, label: 'Forward', glyph: 'forward' },
];

function TimeSection({ time, onCommand }: TimeSectionProps) {
  const setRate = (rateIndex: number): void =>
    onCommand({ name: 'timeSetRate', payload: { rateIndex } });
  const pickDate = (value: string): void => {
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (Number.isFinite(ms))
      onCommand({ name: 'timeSetDate', payload: { simDays: unixMsToJulianDays(ms) } });
  };
  return (
    <div className={controls.stack}>
      <TimeRow time={time} onCommand={onCommand} />
      <div className={styles.pair} role="radiogroup" aria-label="Direction">
        {DIRECTIONS.map(({ value, label, glyph }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={time.direction === value}
            className={cx(controls.button, styles.choice, time.direction === value && controls.on)}
            onClick={() => onCommand({ name: 'timeSetDirection', payload: { direction: value } })}
          >
            <RemoteIcon glyph={glyph} />
            {label}
          </button>
        ))}
      </div>
      <div className={styles.rate}>
        <button
          type="button"
          className={cx(controls.button, styles.choice)}
          disabled={time.rateIndex <= 0}
          onClick={() => setRate(time.rateIndex - 1)}
        >
          <RemoteIcon glyph="slower" />
          Slower
        </button>
        <span className={styles.rateLabel}>{RATE_LADDER[time.rateIndex]?.label}</span>
        <button
          type="button"
          className={cx(controls.button, styles.choice)}
          disabled={time.rateIndex >= RATE_LADDER.length - 1}
          onClick={() => setRate(time.rateIndex + 1)}
        >
          <RemoteIcon glyph="faster" />
          Faster
        </button>
      </div>
      <label className={styles.date}>
        <span className={styles.dateLabel}>
          <RemoteIcon glyph="calendar" />
          Jump to date
        </span>
        <input
          type="date"
          className={cx(controls.input, styles.input)}
          value={simDaysToIsoDate(time.simDays)}
          onChange={(e) => pickDate(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={cx(controls.button, styles.choice)}
        onClick={() => onCommand({ name: 'timeGoLive', payload: null })}
      >
        <RemoteIcon glyph="live" />
        Go live
      </button>
    </div>
  );
}

export default TimeSection;
