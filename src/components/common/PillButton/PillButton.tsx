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
 * icon swap, onClick); PillButton owns the visual identity, the
 * shared `hidden` fade-out used during palette-open transitions, and
 * the optional hover/focus `tooltip` box (these pills are icon-only,
 * so a short label is the only thing telling a newcomer what each
 * glyph does).
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
  /**
   * Optional short label shown in a frosted-glass box below the pill
   * on hover / keyboard focus. These icon-only pills carry no visible
   * text, so the tooltip is what tells a first-time user what each
   * glyph does — keep it terse (a few words). Purely visual: the
   * screen-reader name still comes from the consumer's `aria-label`,
   * so the box is `aria-hidden` to avoid a double announcement. Omit
   * it and no box renders.
   */
  readonly tooltip?: string;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly ref?: Ref<HTMLButtonElement>;
  };

function PillButton({
  hidden = false,
  tooltip,
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
      {tooltip && (
        <span className={styles.tooltip} aria-hidden="true">
          {tooltip}
        </span>
      )}
    </button>
  );
}

export default PillButton;
