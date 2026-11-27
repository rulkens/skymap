/**
 * DebugInfoTip — the MCPM workbench's ⓘ help tip at the end of a DebugPanel row. A sibling of
 * the row's control, never inside its `<label>`, so pressing it never flips or moves the control.
 */

import type { ReactNode } from 'react';
import CompactInfoTip from '../../../packages/shared/src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './DebugInfoTip.module.css';

export type DebugInfoTipProps = {
  /** The row's label, which names the button for a screen reader. */
  readonly label: string;
  readonly info: string;
};

function DebugInfoTip({ label, info }: DebugInfoTipProps): ReactNode {
  return (
    <CompactInfoTip label={info} align="end">
      <button type="button" className={styles.root} aria-label={`About ${label}`}>
        ⓘ
      </button>
    </CompactInfoTip>
  );
}

export default DebugInfoTip;
