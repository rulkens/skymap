/** ToggleSection — one switch per label layer, in the order the dome reports them. */

import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';
import styles from './ToggleSection.module.css';

export type ToggleSectionProps = {
  toggles: DomeStatus['toggles'];
  onCommand: (command: RemoteCommand) => void;
};

function ToggleSection({ toggles, onCommand }: ToggleSectionProps) {
  if (toggles.length === 0) return null;
  const on = toggles.filter((toggle) => toggle.enabled).length;
  return (
    <section className={controls.section}>
      <div className={styles.head}>
        <h2 className={controls.heading}>Labels</h2>
        <span className={styles.count}>
          {on} of {toggles.length} on
        </span>
      </div>
      {toggles.map((toggle) => (
        <label key={toggle.id} className={styles.row}>
          <input
            type="checkbox"
            className={styles.box}
            checked={toggle.enabled}
            onChange={(e) =>
              onCommand({
                name: 'toggleSet',
                payload: { id: toggle.id, enabled: e.target.checked },
              })
            }
          />
          {toggle.label}
        </label>
      ))}
    </section>
  );
}

export default ToggleSection;
