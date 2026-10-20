/* Spine — the stops of the flight as a line down the right of the stage, a ring for each; the line fills as the flight goes and a ring scrolls the flight to its stop. */
import type { RefObject } from 'react';

import type { FlightStopView } from '../../@types/FlightStopView';
import styles from './Spine.module.css';

type SpineProps = {
  stops: readonly FlightStopView[];
  shown: number;
  fill: RefObject<HTMLElement | null>;
  onGo: (stop: number) => void;
};

function Spine({ stops, shown, fill, onGo }: SpineProps) {
  return (
    <div className={styles.spine} role="group" aria-label="Stops on the flight">
      <i ref={fill} className={styles.fill} />
      {stops.map((stop, i) => (
        <button
          key={stop.id}
          className={styles.dot}
          type="button"
          style={{ top: stop.spineTop }}
          aria-label={`Scroll the flight to ${stop.name}`}
          aria-current={i === shown}
          onClick={() => onGo(i)}
        >
          <span>{stop.name}</span>
        </button>
      ))}
    </div>
  );
}

export default Spine;
