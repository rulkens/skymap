/** SetupSection — the set-once choices: pairing another phone, and the phone's red light. */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import controls from '../remoteControls.module.css';

export type SetupSectionProps = {
  readonly onAddPhone: () => void;
  readonly redLight: boolean;
  readonly onRedLight: (on: boolean) => void;
};

function SetupSection({ onAddPhone, redLight, onRedLight }: SetupSectionProps): ReactNode {
  return (
    <div className={controls.stack}>
      <button type="button" className={cx(controls.button, controls.row)} onClick={onAddPhone}>
        <RemoteIcon glyph="phone" />
        Add a phone
      </button>
      <label className={cx(controls.button, controls.row)}>
        <RemoteIcon glyph="redLight" />
        <span className={controls.grow}>Red light</span>
        <input
          type="checkbox"
          role="switch"
          className={controls.switch}
          checked={redLight}
          onChange={(e) => onRedLight(e.target.checked)}
        />
      </label>
    </div>
  );
}

export default SetupSection;
