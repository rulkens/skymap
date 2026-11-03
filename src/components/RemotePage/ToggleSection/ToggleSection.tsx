/** ToggleSection — one switch per label layer, in the order the dome reports them. */

import cx from 'classnames';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';
import styles from './ToggleSection.module.css';

export type ToggleSectionProps = {
  toggles: DomeStatus['toggles'];
  onCommand: (command: RemoteCommand) => void;
};

function ToggleSection({ toggles, onCommand }: ToggleSectionProps) {
  if (toggles.length === 0) return <p className={styles.empty}>The dome lists no labels</p>;
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
            onChange={(e) =>
              onCommand({
                name: 'toggleSet',
                payload: { id: toggle.id, enabled: e.target.checked },
              })
            }
          />
        </label>
      ))}
    </div>
  );
}

export default ToggleSection;
