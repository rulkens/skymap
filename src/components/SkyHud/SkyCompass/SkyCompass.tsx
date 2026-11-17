/**
 * SkyCompass — the horizon ribbon: 120° of bearings centred on the heading, faded at both ends,
 * with an accent caret under the centre. Ticks are placed in percent, so the parent sets the width.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import { compassTicks } from '../../../utils/sky/compassTicks';
import styles from './SkyCompass.module.css';

const SPAN_DEG = 120;

export type SkyCompassProps = {
  readonly azimuthDeg: number;
};

function SkyCompass({ azimuthDeg }: SkyCompassProps): ReactNode {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.ribbon}>
        {compassTicks(azimuthDeg, SPAN_DEG).map((tick) => (
          <span key={tick.key} className={styles.mark} style={{ left: `${tick.offset * 100}%` }}>
            <span className={cx(styles.tick, styles[tick.kind])} />
            {tick.label !== null && (
              <span className={cx(styles.label, styles[`${tick.kind}Label`])}>{tick.label}</span>
            )}
          </span>
        ))}
        <span className={styles.base} />
      </div>
      <span className={styles.caret} />
    </div>
  );
}

export default SkyCompass;
