/** ToggleSection — one switch per row the dome reports (its label toggles, or its Layers), in its order. */

import cx from 'classnames';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import controls from '../remoteControls.module.css';
import styles from './ToggleSection.module.css';

export type ToggleSectionProps = {
  toggles: DomeStatus['toggles'];
  /** Shown when the dome lists no rows. */
  empty: string;
  onSet: (id: string, enabled: boolean) => void;
};

function ToggleSection({ toggles, empty, onSet }: ToggleSectionProps) {
  if (toggles.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <div className={styles.list}>
      {toggles.map((toggle) => (
        <label key={toggle.id} className={cx(controls.row, styles.row)}>
          <span className={controls.grow}>{toggle.label}</span>
          <input
            type="checkbox"
            role="switch"
            className={controls.switch}
            checked={toggle.enabled}
            onChange={(e) => onSet(toggle.id, e.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}

export default ToggleSection;
