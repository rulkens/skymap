/** ZoomIcon — a mouse whose wheel rolls down and fades, the website hero's scroll cue. */

import type { ReactNode } from 'react';
import styles from './ZoomIcon.module.css';

function ZoomIcon(): ReactNode {
  return (
    <svg viewBox="0 0 18 28" className={styles.root} strokeWidth="1.4">
      <rect x="0.7" y="0.7" width="16.6" height="26.6" rx="8.3" fill="none" stroke="currentColor" />
      <rect x="8" y="5" width="2" height="6" rx="1" className={styles.wheel} />
    </svg>
  );
}

export default ZoomIcon;
