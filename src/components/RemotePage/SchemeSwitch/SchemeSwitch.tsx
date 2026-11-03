/**
 * SchemeSwitch — the dome's camera scheme as two icon-only radio buttons. It shows the dome's
 * status, never its own guess, so a tap only takes effect once the dome echoes it back.
 */

import cx from 'classnames';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import type { RemoteGlyph } from '../../../@types/remote/RemoteGlyph';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import controls from '../remoteControls.module.css';
import styles from './SchemeSwitch.module.css';

export type SchemeSwitchProps = {
  readonly scheme: ControlSchemeId;
  readonly onChange: (scheme: ControlSchemeId) => void;
};

const SEGMENTS: readonly { id: ControlSchemeId; label: string; glyph: RemoteGlyph }[] = [
  { id: 'skymap', label: 'Skymap', glyph: 'skymap' },
  { id: 'openspace', label: 'OpenSpace', glyph: 'openspace' },
];

function SchemeSwitch({ scheme, onChange }: SchemeSwitchProps) {
  return (
    <div className={styles.root} role="radiogroup" aria-label="Camera controls">
      {SEGMENTS.map(({ id, label, glyph }) => (
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
          <RemoteIcon glyph={glyph} />
        </button>
      ))}
    </div>
  );
}

export default SchemeSwitch;
