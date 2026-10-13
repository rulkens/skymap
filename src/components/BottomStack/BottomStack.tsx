/**
 * BottomStack — the phone HUD's bottom layout: dock on the edge, the time row
 * above it when open, a sheet above both.
 *
 * `.root` sets `--bottom-stack-height` (dock plus time row) and `--sheet-lift`
 * (the peek, while a sheet shows); the fixed sheet and scale bracket offset
 * themselves by those. `.root` takes no transform or filter: either would
 * become the containing block for its fixed children.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './BottomStack.module.css';

export type BottomStackProps = {
  readonly timeOpen: boolean;
  /** Null when no sheet is showing. */
  readonly sheet: ReactNode;
  readonly scale: ReactNode;
  readonly timeRow: ReactNode;
  readonly dock: ReactNode;
};

function BottomStack({ timeOpen, sheet, scale, timeRow, dock }: BottomStackProps): ReactNode {
  return (
    <div
      className={cx(styles.root, timeOpen && styles.timeOpen, sheet !== null && styles.hasSheet)}
    >
      {/* Before the sheet so an expanded sheet paints over the bracket. */}
      {scale}
      {sheet}
      <div className={styles.column}>
        {timeOpen && timeRow}
        {dock}
      </div>
    </div>
  );
}

export default BottomStack;
