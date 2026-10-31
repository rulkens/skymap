/**
 * SchemeSwitch — the dome's camera scheme as two icon-only radio buttons. It shows the dome's
 * status, never its own guess, so a tap only takes effect once the dome echoes it back.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import SkymapIcon from './SkymapIcon';
import OpenSpaceIcon from './OpenSpaceIcon';
import controls from '../remoteControls.module.css';
import styles from './SchemeSwitch.module.css';

export type SchemeSwitchProps = {
  readonly scheme: ControlSchemeId;
  readonly onChange: (scheme: ControlSchemeId) => void;
};

const SEGMENTS: readonly { id: ControlSchemeId; label: string; icon: ReactNode }[] = [
  { id: 'skymap', label: 'Skymap', icon: <SkymapIcon /> },
  { id: 'openspace', label: 'OpenSpace', icon: <OpenSpaceIcon /> },
];

function SchemeSwitch({ scheme, onChange }: SchemeSwitchProps) {
  return (
    <div className={styles.root} role="radiogroup" aria-label="Camera controls">
      {SEGMENTS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={scheme === id}
          aria-label={label}
          title={`${label} controls`}
          className={cx(controls.button, styles.segment, scheme === id && controls.on)}
          onClick={() => onChange(id)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export default SchemeSwitch;
