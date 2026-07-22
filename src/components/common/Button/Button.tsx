// src/components/common/Button/Button.tsx
/**
 * Button — the HUD's single push-button primitive.
 *
 * Every clickable affordance in the overlay UI (Splash's Explore /
 * Tour / Reload / Continue anyway, the TimeBar controls) renders
 * through here so they share font, padding,
 * border, focus ring, and disabled treatment.  Per-surface CSS
 * modules previously each rolled their own `.button` rule and
 * drifted (different paddings, different letter-spacing, the
 * splash CTAs hardcoded font-size/font-weight and ended up
 * looking like a different button family).
 *
 * `font: inherit` is the keystone — it makes the button pick up
 * the parent's font-family + size + weight, so a Button placed in
 * the HUD speaks mono, and a Button placed inside the splash card
 * (also mono via .card) does too.  No prop wiring needed; the
 * cascade does the work.
 *
 * Three variants:
 *   - secondary (default) — neutral chrome on glass; the most
 *     common case (Tour CTA).
 *   - primary — accent fill for high-conviction actions (Explore,
 *     Reload).
 *   - ghost — text-only with underline; for low-emphasis escapes
 *     like Splash's "Continue anyway".
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import cx from 'classnames';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly ref?: Ref<HTMLButtonElement>;
  };

function Button({
  variant = 'secondary',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={cx(
        styles.root,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
