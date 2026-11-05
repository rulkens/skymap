/**
 * ArrivalVeil — the opaque cover a deep link opens behind, so the boot home
 * base and any catalog wait never show; it fades once the camera sits on the
 * link's subject. It stays mounted while hidden so the fade can run.
 */

import cx from 'classnames';
import type { ReactNode } from 'react';
import SplashProgress from '../Splash/SplashProgress';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './ArrivalVeil.module.css';

export type ArrivalVeilProps = {
  readonly visible: boolean;
  readonly progress: LoadProgressState | null;
};

function ArrivalVeil({ visible, progress }: ArrivalVeilProps): ReactNode {
  return (
    <div
      className={cx(styles.root, !visible && styles.hidden)}
      role="status"
      aria-label="Opening link"
      aria-busy={visible}
    >
      <SplashProgress progress={progress} />
    </div>
  );
}

export default ArrivalVeil;
