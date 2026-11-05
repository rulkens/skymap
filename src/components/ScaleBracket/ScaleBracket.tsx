/**
 * ScaleBracket — the phone's scale legend: a bare bracket and label with no box,
 * shown only while the scale is changing. It sits bottom-left above the bottom
 * stack (BottomStack supplies the offsets) and never takes touches.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import styles from './ScaleBracket.module.css';

export type ScaleBracketProps = {
  readonly scale: ScaleInfo;
  readonly visible: boolean;
};

function ScaleBracket({ scale, visible }: ScaleBracketProps): ReactNode {
  return (
    <div className={cx(styles.root, visible && styles.visible)} aria-hidden={!visible}>
      <span className={styles.label}>{scale.label}</span>
      <span className={styles.bracket} style={{ width: scale.widthPx + 'px' }} />
    </div>
  );
}

export default ScaleBracket;
