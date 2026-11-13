/**
 * ScaleBar — bottom-right distance legend. Presentational: the engine hands
 * over a formatted label and a pixel width; the bracket shape is CSS borders.
 */

import type { ReactNode, Ref } from 'react';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import styles from './ScaleBar.module.css';

type ScaleBarProps = {
  scale: ScaleInfo;
  ref?: Ref<HTMLDivElement>;
};

export function ScaleBar({ scale, ref }: ScaleBarProps): ReactNode {
  return (
    <div ref={ref} className={styles.scaleBar} aria-label="Scale reference">
      <span className={styles.scaleLabel}>{scale.label}</span>
      {/* Inline width: it changes every frame on zoom. */}
      <span className={styles.scaleLine} style={{ width: scale.widthPx + 'px' }} />
    </div>
  );
}
