/**
 * SchemeSwitch — the dome's camera scheme as two icon-only radio buttons. It shows the dome's
 * status, never its own guess, so a tap only takes effect once the dome echoes it back.
 */

import type { ComponentType } from 'react';
import cx from 'classnames';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import type { IconProps } from '../../Icon/Icon';
import PlanetIcon from '../../icons/PlanetIcon/PlanetIcon';
import SparkleIcon from '../../icons/SparkleIcon/SparkleIcon';
import controls from '../remoteControls.module.css';
import styles from './SchemeSwitch.module.css';

export type SchemeSwitchProps = {
  readonly scheme: ControlSchemeId;
  readonly onChange: (scheme: ControlSchemeId) => void;
};

const SEGMENTS: readonly {
  id: ControlSchemeId;
  label: string;
  icon: ComponentType<Pick<IconProps, 'size'>>;
}[] = [
  { id: 'skymap', label: 'Skymap', icon: SparkleIcon },
  { id: 'openspace', label: 'OpenSpace', icon: PlanetIcon },
];

function SchemeSwitch({ scheme, onChange }: SchemeSwitchProps) {
  return (
    <div className={styles.root} role="radiogroup" aria-label="Camera controls">
      {SEGMENTS.map(({ id, label, icon: SegmentIcon }) => (
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
          <SegmentIcon size={20} />
        </button>
      ))}
    </div>
  );
}

export default SchemeSwitch;
