/**
 * SetupSection — the set-once choices: pairing another phone, and the phone's red light. In an
 * iPhone tab it also says how to get a full screen, which iOS gives only to a Home Screen app.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import MoonIcon from '../../icons/MoonIcon/MoonIcon';
import PhonePlusIcon from '../../icons/PhonePlusIcon/PhonePlusIcon';
import { isIosBrowserTab } from '../../../utils/browser/isIosBrowserTab';
import controls from '../remoteControls.module.css';
import styles from './SetupSection.module.css';

export type SetupSectionProps = {
  readonly onAddPhone: () => void;
  readonly redLight: boolean;
  readonly onRedLight: (on: boolean) => void;
};

function SetupSection({ onAddPhone, redLight, onRedLight }: SetupSectionProps): ReactNode {
  return (
    <div className={styles.root}>
      <button type="button" className={cx(controls.button, controls.row)} onClick={onAddPhone}>
        <PhonePlusIcon size={20} />
        Add a phone
      </button>
      <label className={cx(controls.button, controls.row)}>
        <MoonIcon size={20} />
        <span className={controls.grow}>Red light</span>
        <input
          type="checkbox"
          role="switch"
          className={controls.switch}
          checked={redLight}
          onChange={(e) => onRedLight(e.target.checked)}
        />
      </label>
      {isIosBrowserTab() && (
        <p className={styles.hint}>
          Full screen: tap Share, then Add to Home Screen, and open the remote from its icon.
        </p>
      )}
    </div>
  );
}

export default SetupSection;
