/*
 * Phone3D — a phone drawn in CSS around one manifest picture of the app on a phone. The case is a stack
 * of slices behind the front, so its edge shows depth once the phone is turned. It rests at a fixed tilt;
 * phoneTurn.client.ts turns it a little toward the pointer where there is one and motion is welcome.
 * The host may set its width with `--phone-width` (17rem otherwise); `children` lie over the screen.
 * `follow={false}` leaves the turn to a host that turns the phone with other things (phoneTurn.client.ts).
 */
import type { ReactNode } from 'react';

import Shot from '../Shot/Shot.tsx';
import styles from './Phone3D.module.css';

type Phone3DProps = { shot: string; follow?: boolean; children?: ReactNode };

const SLICES = 9;

function Phone3D({ shot, follow = true, children }: Phone3DProps) {
  return (
    <div className={styles.root} data-phone3d={follow ? '' : undefined}>
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
