/**
 * ScaleBar — bottom-right distance legend. Presentational: the engine hands
 * over a formatted label and a pixel width; the bracket shape is CSS borders.
 * While standing a distance means nothing, so the lens and the spot take its place.
 */

import type { ReactNode } from 'react';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import styles from './ScaleBar.module.css';

export type ScaleBarProps = {
  readonly scale: ScaleInfo;
  readonly standing: { readonly field: string; readonly spot: string } | null;
};

function ScaleBar({ scale, standing }: ScaleBarProps): ReactNode {
  return (
    <div className={styles.root} aria-label="Scale reference">
      {standing === null ? (
        <>
          <span className={styles.scaleLabel}>{scale.label}</span>
          {/* Inline width: it changes every frame on zoom. */}
          <span className={styles.scaleLine} style={{ width: scale.widthPx + 'px' }} />
        </>
      ) : (
        <>
          <span className={styles.field}>{standing.field}</span>
          <span className={styles.spot}>{standing.spot}</span>
        </>
      )}
    </div>
  );
}

export default ScaleBar;
