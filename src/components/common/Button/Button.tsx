/**
 * Button — the HUD's single push-button primitive.
 *
 * Every clickable affordance in the overlay UI (Splash's Explore /
 * Tour / Reload, the TimeBar controls) renders
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
 * Four variants:
 *   - secondary (default) — neutral chrome on glass; the most
 *     common case (Tour CTA).
 *   - primary — accent fill for high-conviction actions (Explore,
 *     Reload).
 *   - ghost — text-only with underline; for low-emphasis escapes.
 *   - quiet — no chrome until hovered; icon buttons among content.
 * `size="compact"` is a 24 px target for icon buttons in dense bars.
 * `aria-pressed` shows a toggle's on state.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import cx from 'classnames';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet';

export type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly size?: 'default' | 'compact';
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly ref?: Ref<HTMLButtonElement>;
  };

function Button({
  variant = 'secondary',
  size = 'default',
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
        variant === 'quiet' && styles.quiet,
        size === 'compact' && styles.compact,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
