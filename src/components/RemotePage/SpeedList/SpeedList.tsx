/** SpeedList — every playback speed, fastest first as in the app's speed popover, the current one marked. */

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import { RATE_LADDER } from '../../../data/time/rateLadder';
import controls from '../remoteControls.module.css';
import styles from './SpeedList.module.css';

export type SpeedListProps = {
  readonly id: string;
  readonly currentIndex: number;
  readonly onPick: (rateIndex: number) => void;
};

const FASTEST_FIRST = RATE_LADDER.map((step, index) => ({ label: step.label, index })).reverse();

function SpeedList({ id, currentIndex, onPick }: SpeedListProps): ReactNode {
  const listRef = useRef<HTMLUListElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  // Open on the speed in use. Only the list scrolls: scrollIntoView would scroll the sheet too.
  useLayoutEffect(() => {
    const list = listRef.current;
    const current = currentRef.current;
    if (list && current)
      list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
  }, []);
  return (
    <ul ref={listRef} id={id} aria-label="Speeds" className={cx(controls.rows, styles.root)}>
      {FASTEST_FIRST.map(({ label, index }) => (
        <li key={label}>
          <button
            ref={index === currentIndex ? currentRef : undefined}
            type="button"
            aria-current={index === currentIndex || undefined}
            className={cx(controls.button, controls.row, index === currentIndex && controls.on)}
            onClick={() => onPick(index)}
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default SpeedList;
