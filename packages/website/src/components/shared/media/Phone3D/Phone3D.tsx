/*
 * Phone3D — a phone drawn in CSS around one manifest picture of the app on a phone. The case is a stack
 * of slices behind the front, so its edge shows depth once the phone is turned. It rests at a fixed tilt;
 * styles/pointer.client.ts turns it a little toward the pointer where there is one and motion is welcome.
 * The host may set its width with `--phone-width`, or `width` sets it here (17rem otherwise); `children` lie over
 * the screen.
 * `follow={false}` leaves the turn to a host that turns the phone with other things.
 */
import type { CSSProperties, ReactNode } from 'react';

import Shot from '../Shot/Shot.tsx';
import styles from './Phone3D.module.css';

type Phone3DProps = { shot: string; follow?: boolean; width?: string; children?: ReactNode };

const SLICES = 9;

function Phone3D({ shot, follow = true, width, children }: Phone3DProps) {
  return (
    <div
      className={styles.root}
      style={width ? ({ '--phone-width': width } as CSSProperties) : undefined}
      data-turn={follow ? '' : undefined}
    >
      <div className={styles.case}>
        {Array.from({ length: SLICES }, (_, i) => (
          <span key={i} className={styles.slice} style={{ transform: `translateZ(${-i - 1}px)` }} />
        ))}
        <div className={styles.front}>
          <div className={styles.screen}>
            <Shot id={shot} sizes="15rem" />
            {children}
          </div>
          <span className={styles.island} />
        </div>
      </div>
    </div>
  );
}

export default Phone3D;
