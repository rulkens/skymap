/**
 * SchemeSwitch — the dome's camera scheme as a two-segment radio group. It shows the dome's
 * status, never its own guess, so a tap only takes effect once the dome echoes it back.
 */

import cx from 'classnames';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import controls from '../remoteControls.module.css';
import styles from './SchemeSwitch.module.css';

export type SchemeSwitchProps = {
  readonly scheme: ControlSchemeId;
  readonly onChange: (scheme: ControlSchemeId) => void;
};

const SEGMENTS: readonly { id: ControlSchemeId; label: string }[] = [
  { id: 'skymap', label: 'Skymap' },
  { id: 'openspace', label: 'OpenSpace' },
];

function SchemeSwitch({ scheme, onChange }: SchemeSwitchProps) {
  return (
    <div className={styles.root} role="radiogroup" aria-label="Camera controls">
      {SEGMENTS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={scheme === id}
          className={cx(controls.button, styles.segment, scheme === id && styles.selected)}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default SchemeSwitch;
