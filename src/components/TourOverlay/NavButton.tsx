// src/components/TourOverlay/NavButton.tsx
/**
 * NavButton — the tour nav cluster's bare text/icon button (previous, next).
 * Factoring the repeated `<button className={navBtn} …>` shell into one
 * component keeps the cluster's markup to one button per role and one place
 * to evolve the shared styling. The glyph is passed as children; the
 * disabled-prev `ghost` dim (or any extra class) rides in via `className`.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './TourOverlay.module.css';

export type NavButtonProps = {
  readonly onClick: () => void;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

function NavButton({
  onClick,
  ariaLabel,
  disabled = false,
  className,
  children,
}: NavButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.navBtn, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export default NavButton;
