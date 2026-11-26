/**
 * SkyEntryButton — "Look up from here", bottom centre, shown while there is ground to stand on.
 * It stays mounted and fades on `visible` (inert while hidden) so the gate never pops it. On a
 * phone the label names the place and no key is printed; on a desktop the `S` key is.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import ActionPill from '../common/ActionPill/ActionPill';
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
  // The fade sits on a wrapper: the pill's own transition is its hover, and two `transition`
  // rules on one element would fight over the cascade order of two modules.
  return (
    <div className={cx(styles.root, phone && styles.phone, visible && styles.visible)}>
      <ActionPill
        icon={<HorizonIcon size={16} />}
        label={label}
        keyHint={phone ? undefined : 'S'}
        inert={!visible}
        aria-hidden={!visible || undefined}
        aria-keyshortcuts={phone ? undefined : 'S'}
        onClick={onEnter}
        onPointerEnter={() => onPreview(true)}
        onPointerLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
      />
    </div>
  );
}

export default SkyEntryButton;
