/**
 * IconTip — a section icon with a tip on its hover. Hidden from assistive tech: the tip
 * text carries `id` so the fold button can point `aria-describedby` at it instead.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './IconTip.module.css';

export type IconTipProps = {
  readonly id: string;
  readonly tip: ReactNode;
  readonly children: ReactNode;
};

function IconTip({ id, tip, children }: IconTipProps): ReactNode {
  return (
    <span className={styles.root} aria-hidden>
      <CompactInfoTip
        label={
          <span id={id} className={styles.tipText}>
            {tip}
          </span>
        }
        placement="bottom"
        align="start"
      >
        {children}
      </CompactInfoTip>
    </span>
  );
}

export default IconTip;
