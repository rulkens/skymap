/**
 * TimelineStepper — Previous / Next over the selected craft's events with an "n of m" count;
 * each button is disabled when there is no event in that direction.
 */

import type { ReactNode } from 'react';

import styles from './ExhibitTimeline.module.css';

export type TimelineStepperProps = {
  readonly index: number;
  readonly total: number;
  readonly onPrev: (() => void) | null;
  readonly onNext: (() => void) | null;
};

function TimelineStepper({ index, total, onPrev, onNext }: TimelineStepperProps): ReactNode {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.step}
        disabled={!onPrev}
        onClick={onPrev ?? undefined}
      >
        ← Previous
      </button>
      <span className={styles.count}>
        {index} of {total}
      </span>
      <button
        type="button"
        className={styles.step}
        disabled={!onNext}
        onClick={onNext ?? undefined}
      >
        Next →
      </button>
    </div>
  );
}

export default TimelineStepper;
