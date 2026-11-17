/**
 * FullscreenButton — hides the browser's bars where the Fullscreen API allows it. An iPhone has no
 * such API, so there the button is absent and Add to Home Screen does the job (see SetupSection).
 */

import cx from 'classnames';
import type { ReactNode } from 'react';
import { useFullscreen } from '../../../hooks/useFullscreen';
import FullscreenIcon from '../../icons/FullscreenIcon/FullscreenIcon';
import styles from './FullscreenButton.module.css';

export type FullscreenButtonProps = {
  readonly className?: string;
};

function FullscreenButton({ className }: FullscreenButtonProps): ReactNode {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;
  return (
    <button
      type="button"
      className={cx(styles.root, className)}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      onClick={toggle}
    >
      <FullscreenIcon size={20} active={active} />
    </button>
  );
}

export default FullscreenButton;
