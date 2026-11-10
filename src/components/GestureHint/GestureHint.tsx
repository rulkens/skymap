/**
 * GestureHint — a frosted chip telling a person the view moves: one segment per gesture, in
 * `gestures` order. A gesture learned before mount never shows; one learned while shown fades
 * out and is then dropped, so the chip shrinks to what is left and goes once nothing is.
 * Wording follows the primary pointer in CSS (`pointer: coarse` reads "Swipe" and "Pinch").
 * Placement is the consumer's `className`.
 */

import { useState, type ReactNode, type TransitionEvent } from 'react';
import cx from 'classnames';

import { GESTURE_HINTS } from './GestureHint.constants';
import type { CameraGesture } from '../../@types/ui/CameraGesture';
import styles from './GestureHint.module.css';

export type GestureHintProps = {
  readonly gestures: readonly CameraGesture[];
  readonly learned: Readonly<Record<CameraGesture, boolean>>;
  readonly className?: string;
};

function GestureHint({ gestures, learned, className }: GestureHintProps): ReactNode {
  const [shown, setShown] = useState(() => gestures.filter((g) => !learned[g]));
  if (shown.length === 0) return null;

  // Only the segment's own fade ends it: its divider (`::before`) fires here too.
  const dropOnFaded = (gesture: CameraGesture) => (e: TransitionEvent) => {
    if (e.target === e.currentTarget && !e.pseudoElement && learned[gesture]) {
      setShown((s) => s.filter((g) => g !== gesture));
    }
  };

  return (
    <div className={cx(styles.root, className)} role="note">
      {shown.map((gesture) => {
        const { Icon, mouse, touch } = GESTURE_HINTS[gesture];
        return (
          <span
            key={gesture}
            className={cx(styles.item, learned[gesture] && styles.leaving)}
            onTransitionEnd={dropOnFaded(gesture)}
          >
            <span className={styles.icon} aria-hidden="true">
              <Icon />
            </span>
            <span className={styles.mouse}>{mouse}</span>
            <span className={styles.touch}>{touch}</span>
          </span>
        );
      })}
    </div>
  );
}

export default GestureHint;
