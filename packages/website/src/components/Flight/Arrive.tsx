/* Arrive — the flight's last words, over the last stop, and the way into the app. */
import type { Ref } from 'react';

import OpenApp from '../OpenApp/OpenApp.tsx';
import styles from './Arrive.module.css';

type ArriveProps = { ref: Ref<HTMLDivElement> };

function Arrive({ ref }: ArriveProps) {
  return (
    <div ref={ref} className={styles.arrive}>
      <p>Try it yourself!</p>
      <OpenApp />
    </div>
  );
}

export default Arrive;
