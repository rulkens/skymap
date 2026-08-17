// src/components/common/CompactInfoTip/CompactInfoTip.tsx
/**
 * CompactInfoTip — a self-contained hover/focus label for chrome that lives
 * inside a frosted-glass surface.
 *
 * InfoTip (src/components/InfoTip/) anchors with `position: fixed`, but a
 * `backdrop-filter` ancestor becomes the containing block for fixed
 * descendants (CSS treats `backdrop-filter` like `transform` here), so
 * inside PillButton/TimeBar's glass surfaces the tip re-bases into the tiny
 * pill box and renders on top of the button it labels. This component uses
 * `position: absolute` inside a `position: relative` wrapper instead, so it
 * has no containing block to escape.
 *
 * A disabled child button still lets the wrapper's own box reveal the tip on
 * hover (disabling a button doesn't stop pointer events reaching its
 * parent) — render disabled controls WITHOUT this wrapper.
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
