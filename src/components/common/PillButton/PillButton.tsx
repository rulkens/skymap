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
 * the optional hover/focus label (these pills are icon-only, so a
 * short hint is the only thing telling a newcomer what each glyph
 * does).  That hint is an InfoTip in its compact label-only shape,
 * wrapping the button in `interactive` mode: the button stays the
 * focus target and the tip reveals on hover / keyboard focus.  Placed
 * BELOW the pill because the top-bar row hugs the viewport top and has
 * no room above.  InfoTip's `position: fixed` panel escapes any
 * ancestor clipping, so the pill needs no clip-path escape hatch.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import cx from 'classnames';
import { InfoTip } from '../../InfoTip/InfoTip';
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
   * text, so the label is what tells a first-time user what each glyph
   * does — keep it terse (a few words). The screen-reader name still
   * comes from the consumer's `aria-label`, and InfoTip's interactive
   * mode leaves the button as the sole focus + described target, so
   * there's no double announcement. Omit it and no label renders.
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
  const button = (
    <button
      type={type}
      className={cx(styles.root, hidden && styles.hidden, className)}
      aria-hidden={hidden || undefined}
      {...rest}
    >
      {children}
    </button>
  );
  // Top-bar row hugs the viewport top, so the hint drops BELOW the pill.
  return tooltip ? (
    <InfoTip title={tooltip} placement="bottom" interactive>
      {button}
    </InfoTip>
  ) : (
    button
  );
}

export default PillButton;
