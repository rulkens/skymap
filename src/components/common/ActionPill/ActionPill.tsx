/**
 * ActionPill — the HUD's labelled pill over the canvas: an optional icon, a short label and the
 * dim key that does the same thing. The labelled sibling of the icon-only PillButton; Button
 * stays the push-button inside panels and cards. Consumers own placement and entrance (via
 * `className`) and the button's semantics (`aria-keyshortcuts`, `inert`, handlers via the rest).
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import cx from 'classnames';
import styles from './ActionPill.module.css';

export type ActionPillProps = {
  readonly icon?: ReactNode;
  readonly label: string;
  /** Printed on the pill only; pair it with `aria-keyshortcuts`, and omit it on a phone. */
  readonly keyHint?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

function ActionPill({
  icon,
  label,
  keyHint,
  className,
  type = 'button',
  ...rest
}: ActionPillProps): ReactNode {
  return (
    <button
      type={type}
      className={cx(styles.root, icon !== undefined && styles.withIcon, className)}
      {...rest}
    >
      {icon !== undefined && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.label}>{label}</span>
      {keyHint !== undefined && (
        <kbd className={styles.key} aria-hidden="true">
          {keyHint}
        </kbd>
      )}
    </button>
  );
}

export default ActionPill;
