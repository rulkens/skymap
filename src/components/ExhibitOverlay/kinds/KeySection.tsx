/**
 * KeySection — a colour-ramp legend with an optional switch. The switch is honest as local
 * state: during a takeover nothing else writes what its arms touch, the overlay remounts per
 * exhibit, and `withSceneSnapshotSaga`'s snapshot rewinds the arms on exit.
 */

import { useState, type ReactNode } from 'react';
import cx from 'classnames';

import { useAppDispatch } from '../../../store/hooks';
import type { ExhibitKeySection } from '../../../@types/exhibits/ExhibitKeySection';
import styles from '../ExhibitOverlay.module.css';

export type KeySectionProps = {
  readonly data: ExhibitKeySection;
};

function KeySection({ data }: KeySectionProps): ReactNode {
  const dispatch = useAppDispatch();
  const [on, setOn] = useState(false);
  const { toggle } = data;
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{data.heading}</h2>
      <div className={styles.key}>
        <div
          className={styles.ramp}
          style={{ backgroundImage: `linear-gradient(90deg, ${data.ramp.join(', ')})` }}
          aria-hidden="true"
        />
        <div className={styles.rampEnds} aria-hidden="true">
          {data.ends.map((end) => (
            <div key={end}>{end}</div>
          ))}
        </div>
        {toggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            className={styles.toggleRow}
            onClick={() => {
              setOn(!on);
              for (const action of on ? toggle.off : toggle.on) dispatch(action);
            }}
          >
            <span className={styles.toggleLabel}>
              {toggle.label}{' '}
              <span className={styles.toggleState}>· {on ? toggle.onWord : toggle.offWord}</span>
            </span>
            <span className={cx(styles.track, on && styles.trackOn)}>
              <span className={cx(styles.knob, on && styles.knobOn)} />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default KeySection;
