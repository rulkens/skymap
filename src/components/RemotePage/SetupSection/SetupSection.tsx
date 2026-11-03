/** SetupSection — the set-once choices: pairing another phone. */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import controls from '../remoteControls.module.css';

export type SetupSectionProps = {
  readonly onAddPhone: () => void;
};

function SetupSection({ onAddPhone }: SetupSectionProps): ReactNode {
  return (
    <div className={controls.stack}>
      <button type="button" className={cx(controls.button, controls.row)} onClick={onAddPhone}>
        <RemoteIcon glyph="phone" />
        Add a phone
      </button>
    </div>
  );
}

export default SetupSection;
