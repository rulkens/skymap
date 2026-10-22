/** TimeSection — pause, speed, direction, a date to jump to, and back to live. */

import { RATE_LADDER } from '../../../data/time/rateLadder';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';
import styles from './TimeSection.module.css';

const dateOf = (simDays: number): string =>
  new Date(julianDaysToUnixMs(simDays)).toISOString().slice(0, 10);

export type TimeSectionProps = {
  time: DomeStatus['time'];
  onCommand: (command: RemoteCommand) => void;
};

function TimeSection({ time, onCommand }: TimeSectionProps) {
  const setRate = (rateIndex: number): void =>
    onCommand({ name: 'timeSetRate', payload: { rateIndex } });
  const pickDate = (value: string): void => {
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (Number.isFinite(ms))
      onCommand({ name: 'timeSetDate', payload: { simDays: unixMsToJulianDays(ms) } });
  };
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Time</h2>
      <p role="status" className={styles.readout}>
        {time.mode === 'live' ? 'Live' : dateOf(time.simDays)}
        {time.paused
          ? ', paused'
          : `, ${time.direction === 1 ? '' : 'back '}${RATE_LADDER[time.rateIndex]?.label ?? ''}`}
      </p>
      <div className={controls.row}>
        <button
          type="button"
          className={controls.button}
          onClick={() =>
            onCommand({ name: time.paused ? 'timeResume' : 'timePause', payload: null })
          }
        >
          {time.paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className={controls.button}
          onClick={() =>
            onCommand({
              name: 'timeSetDirection',
              payload: { direction: time.direction === 1 ? -1 : 1 },
            })
          }
        >
          {time.direction === 1 ? 'Reverse' : 'Forward'}
        </button>
        <button
          type="button"
          className={controls.button}
          onClick={() => onCommand({ name: 'timeGoLive', payload: null })}
        >
          Live
        </button>
      </div>
      <div className={controls.row}>
        <button
          type="button"
          className={controls.button}
          disabled={time.rateIndex <= 0}
          onClick={() => setRate(time.rateIndex - 1)}
        >
          Slower
        </button>
        <button
          type="button"
          className={controls.button}
          disabled={time.rateIndex >= RATE_LADDER.length - 1}
          onClick={() => setRate(time.rateIndex + 1)}
        >
          Faster
        </button>
      </div>
      <label className={styles.date}>
        Jump to date
        <input
          type="date"
          className={styles.input}
          value={dateOf(time.simDays)}
          onChange={(e) => pickDate(e.target.value)}
        />
      </label>
    </section>
  );
}

export default TimeSection;
