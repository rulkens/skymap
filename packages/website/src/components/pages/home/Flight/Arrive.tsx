/*
 * Arrive — the flight's last words and the way into the app, set on its last picture: the whole
 * observable universe, centred on us. A label marks where we are; the words and Open app stand
 * under it, and pointing at the button selects the universe, the ring closing in on its edge.
 */
import type { Ref } from 'react';

import OpenApp from '../../../shared/links/OpenApp/OpenApp.tsx';
import styles from './Arrive.module.css';

/** `here` marks us on the picture; `invite` stands over Open app. */
type ArriveProps = { ref: Ref<HTMLDivElement>; here: string; invite: string };

function Arrive({ ref, here, invite }: ArriveProps) {
  return (
    <div ref={ref} className={styles.arrive}>
      {/* Drawn on the picture, so they say nothing to a reader of the text alone. */}
      <span className={styles.horizon} aria-hidden="true" />
      <span className={styles.here} aria-hidden="true">
        <span>{here}</span>
      </span>
      <div className={styles.words}>
        <p>{invite}</p>
        <OpenApp />
      </div>
    </div>
  );
}

export default Arrive;
