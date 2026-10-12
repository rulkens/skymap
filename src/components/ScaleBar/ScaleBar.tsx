/**
 * ScaleBar — bottom-right distance legend. Presentational: the engine hands
 * over a formatted label and a pixel width; the bracket shape is CSS borders.
 */

import type { ReactNode } from 'react';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import styles from './ScaleBar.module.css';

type ScaleBarProps = {
  scale: ScaleInfo;
};

export function ScaleBar({ scale }: ScaleBarProps): ReactNode {
  return (
    <div className={styles.scaleBar} aria-label="Scale reference">
      <span className={styles.scaleLabel}>{scale.label}</span>
      {/* Inline width: it changes every frame on zoom. */}
      <span className={styles.scaleLine} style={{ width: scale.widthPx + 'px' }} />
    </div>
  );
}
