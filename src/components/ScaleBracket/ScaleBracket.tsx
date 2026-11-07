/**
 * ScaleBracket — the phone's scale legend: a bare bracket and label with no box,
 * shown only while the scale is changing. It sits bottom-left above the bottom
 * stack (BottomStack supplies the offsets) and never takes touches. While
 * standing, the lens and the spot take its place.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import styles from './ScaleBracket.module.css';
import type { StandingReadout } from '../../@types/sky/StandingReadout';

export type ScaleBracketProps = {
  readonly scale: ScaleInfo;
  readonly standing: StandingReadout | null;
  readonly visible: boolean;
};

function ScaleBracket({ scale, standing, visible }: ScaleBracketProps): ReactNode {
  return (
    <div className={cx(styles.root, visible && styles.visible)} aria-hidden={!visible}>
      {standing === null ? (
        <>
          <span className={styles.label}>{scale.label}</span>
          <span className={styles.bracket} style={{ width: scale.widthPx + 'px' }} />
        </>
      ) : (
        <>
          <span className={styles.label}>{standing.field}</span>
          <span className={styles.label}>{standing.spot}</span>
        </>
      )}
    </div>
  );
}

export default ScaleBracket;
