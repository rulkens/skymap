/**
 * SkyEntryButton — "Look up from here", bottom centre, shown while there is ground to stand on.
 * It stays mounted and fades on `visible` (inert while hidden) so the gate never pops it. On a
 * phone the label names the place and no key is printed; on a desktop the `S` key is.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import HorizonIcon from '../icons/HorizonIcon/HorizonIcon';
import styles from './SkyEntryButton.module.css';

export type SkyEntryButtonProps = {
  readonly visible: boolean;
  readonly label: string;
  readonly phone: boolean;
  readonly onEnter: () => void;
  /** Hover or keyboard focus in (true) and out (false): the desktop's spot preview. */
  readonly onPreview: (on: boolean) => void;
};

function SkyEntryButton({
  visible,
  label,
  phone,
  onEnter,
  onPreview,
}: SkyEntryButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.root, phone && styles.phone, visible && styles.visible)}
      inert={!visible}
      aria-hidden={!visible || undefined}
      aria-keyshortcuts={phone ? undefined : 'S'}
      onClick={onEnter}
      onPointerEnter={() => onPreview(true)}
      onPointerLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
    >
      <HorizonIcon size={16} />
      <span className={styles.label}>{label}</span>
      {!phone && (
        <kbd className={styles.key} aria-hidden="true">
          S
        </kbd>
      )}
    </button>
  );
}

export default SkyEntryButton;
