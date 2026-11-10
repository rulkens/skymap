/** LookIcon — a mouse with its left button lit, swaying between two chevrons: drag to look. */

import type { ReactNode } from 'react';
import styles from './LookIcon.module.css';

function LookIcon(): ReactNode {
  return (
    <svg viewBox="0 0 36 28" className={styles.root} fill="none" strokeWidth="1.4">
      <path d="M4 10 L1 14 L4 18" className={styles.chevron} />
      <g className={styles.mouse}>
        <rect x="9.7" y="0.7" width="16.6" height="26.6" rx="8.3" stroke="currentColor" />
        <path d="M10.4 9 V8.5 A7.6 7.6 0 0 1 18 1 V9 Z" className={styles.button} />
        <line x1="18" y1="1" x2="18" y2="9" stroke="currentColor" />
      </g>
      <path d="M32 10 L35 14 L32 18" className={styles.chevron} />
    </svg>
  );
}

export default LookIcon;
