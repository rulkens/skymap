// src/components/common/CompactInfoTip/CompactInfoTip.tsx
/**
 * CompactInfoTip — a self-contained hover/focus label for chrome that lives
 * inside a frosted-glass surface.
 *
 * InfoTip (src/components/InfoTip/) anchors its tip with `position: fixed` +
 * CSS anchor positioning so the panel can escape any ancestor's clipping.
 * That mechanism breaks down inside PillButton and TimeBar: both wrap their
 * buttons in a glass surface with `backdrop-filter`, and a backdrop-filtered
 * ancestor becomes the containing block for `position: fixed` descendants
 * (the CSS spec treats `filter`/`backdrop-filter` like `transform` for this
 * purpose). InfoTip's tip was re-based into the tiny pill box instead of the
 * viewport, so it rendered on top of the button it was meant to label. A
 * plain `position: absolute` label inside a `position: relative` wrapper —
 * the older, known-good mechanism — sidesteps the problem entirely: it
 * positions relative to this component's own box rather than the viewport,
 * so there's no containing block to escape in the first place.
 *
 * Caveat for disabled controls: the wrapper's own box still reveals the tip
 * on hover even when the child button is `disabled` (a disabled button
 * doesn't stop pointer events from reaching its parent). Consumers must
 * render disabled controls WITHOUT this wrapper, not rely on the button's
 * own `pointer-events: none`.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './CompactInfoTip.module.css';

export type CompactInfoTipProps = {
  /**
   * Tip content. A node, not a string: consumers compose multi-part tips —
   * `ParamSlider` follows its prose with the store path the slider writes.
   */
  readonly label: ReactNode;
  readonly placement?: 'top' | 'bottom';
  readonly align?: 'center' | 'start' | 'end';
  readonly children?: ReactNode;
};

function CompactInfoTip({
  label,
  placement = 'top',
  align = 'center',
  children,
}: CompactInfoTipProps): ReactNode {
  return (
    <span className={styles.root}>
      {children}
      <span
        role="tooltip"
        className={cx(
          styles.tip,
          placement === 'bottom' && styles.tipBottom,
          align === 'start' && styles.tipStart,
          align === 'end' && styles.tipEnd,
        )}
      >
        {label}
      </span>
    </span>
  );
}

export default CompactInfoTip;
