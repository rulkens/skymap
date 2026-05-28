// src/components/common/PillButton/PillButton.tsx
/**
 * PillButton — the HUD's 40 × 40 frosted-glass icon pill.
 *
 * Shared chrome for the top-bar cluster (AboutPill, AutoRotateToggle,
 * any future single-icon affordance). Previously each pill rolled its
 * own .toggle / .pill class with slightly different tokens (one used
 * --color-fg, the other --color-fg-dim; one had an accent focus ring,
 * the other suppressed the outline), so the row of pills looked
 * subtly mismatched. Lifting the chrome here makes them identical by
 * construction.
 *
 * Consumers own the semantics (aria-label, aria-pressed, dynamic
 * icon swap, onClick); PillButton owns the visual identity and the
 * shared `hidden` fade-out used during palette-open transitions.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import cx from 'classnames';
import styles from './PillButton.module.css';

export type PillButtonProps = {
  /**
   * When true the pill fades out + scales down and stops accepting
   * clicks. Matches the SearchTrigger / AboutPill / AutoRotateToggle
   * pattern used while the command palette is open or the splash
   * sits on top.
   */
  readonly hidden?: boolean;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly ref?: Ref<HTMLButtonElement>;
  };

function PillButton({
  hidden = false,
  className,
  type = 'button',
  children,
  ...rest
}: PillButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={cx(styles.root, hidden && styles.hidden, className)}
      aria-hidden={hidden || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PillButton;
