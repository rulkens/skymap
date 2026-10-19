/**
 * VoyageTrack — the scrubber in ship years, launch to arrival, the turnaround ticked at the middle
 * (ship time is symmetric about it). Pointer drag and the keys report ship-time instants through
 * `onSeekTau`, held inside the trip; the parent converts them to Earth time for the clock.
 */

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import cx from 'classnames';

import { formatScalar } from '../../../utils/format/formatScalar';
import styles from './Voyage.module.css';

export type VoyageTrackProps = {
  /** Ship years since launch. */
  readonly tauYr: number;
  readonly tauTotalYr: number;
  /** The ship clock as the readouts write it, for the slider's spoken value. */
  readonly valueText: string;
  readonly onSeekTau: (tauYr: number) => void;
};

/** Arrow-key steps, ship years: a tenth of a year, a whole year with Shift. */
const STEP_YR = 0.1;
const SHIFT_STEP_YR = 1;

const pct = (fraction: number) => `${fraction * 100}%`;

function VoyageTrack({ tauYr, tauTotalYr, valueText, onSeekTau }: VoyageTrackProps): ReactNode {
  const fraction = Math.min(1, Math.max(0, tauYr / tauTotalYr));
  const seek = (tau: number) => onSeekTau(Math.min(tauTotalYr, Math.max(0, tau)));
  const commitFromClientX = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    seek(((clientX - rect.left) / rect.width) * tauTotalYr);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    commitFromClientX(e.currentTarget, e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      commitFromClientX(e.currentTarget, e.clientX);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const span = e.shiftKey ? SHIFT_STEP_YR : STEP_YR;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? tauYr + span
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? tauYr - span
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tauTotalYr
              : null;
    if (next === null) return;
    // Without this the page scrolls under the focused slider.
    e.preventDefault();
    seek(next);
  };

  return (
    <div className={styles.plot}>
      <div
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label="Ship's clock"
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-valuenow={Math.round(fraction * 1000)}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className={styles.lane}>
          <div className={styles.laneLine} />
          <div className={styles.laneFill} style={{ left: 0, width: pct(fraction) }} />
          <span className={styles.midTick} />
        </div>
        <div className={styles.thumb} style={{ left: pct(fraction) }}>
          <span className={styles.knob} />
        </div>
        <div className={styles.axis} aria-hidden="true">
          <span className={cx(styles.axisLabel, styles.axisFirst)} style={{ left: 0 }}>
            Launch
          </span>
          <span className={styles.axisLabel} style={{ left: '50%' }}>
            Turnaround
          </span>
          <span className={cx(styles.axisLabel, styles.axisLast)} style={{ left: '100%' }}>
            {`Arrival · ${formatScalar(tauTotalYr)} yr`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default VoyageTrack;
