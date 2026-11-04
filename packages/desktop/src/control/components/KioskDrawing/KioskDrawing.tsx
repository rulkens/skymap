/** KioskDrawing — a flat screen on its stand with a few stars on it, drawn in the text's colour. */

import type { ReactNode } from 'react';
import styles from './KioskDrawing.module.css';

function KioskDrawing(): ReactNode {
  return (
    <svg className={styles.root} viewBox="0 0 160 100" aria-hidden="true">
      <rect x="24" y="12" width="112" height="64" rx="3" />
      <path d="M80 76v10M60 88h40" />
      <g className={styles.stars}>
        <circle cx="48" cy="30" r="1.6" />
        <circle cx="66" cy="52" r="1.1" />
        <circle cx="92" cy="26" r="1.1" />
        <circle cx="112" cy="46" r="1.8" />
        <circle cx="100" cy="62" r="1" />
        <circle cx="40" cy="60" r="1" />
      </g>
    </svg>
  );
}

export default KioskDrawing;
