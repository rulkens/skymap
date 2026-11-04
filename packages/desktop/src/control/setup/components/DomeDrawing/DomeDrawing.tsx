/** DomeDrawing — a dome in section, its projector at the centre throwing the fisheye picture up onto it. */

import type { ReactNode } from 'react';
import styles from './DomeDrawing.module.css';

function DomeDrawing(): ReactNode {
  return (
    <svg className={styles.root} viewBox="0 0 160 100" aria-hidden="true">
      <path d="M22 84a58 58 0 0 1 116 0" />
      <path d="M14 84h132" />
      <path className={styles.beam} d="M80 78 34 52M80 78 56 34M80 78V27M80 78l24-44M80 78l46-26" />
      <rect x="74" y="78" width="12" height="6" rx="1" />
      <g className={styles.stars}>
        <circle cx="46" cy="44" r="1.4" />
        <circle cx="70" cy="30" r="1.1" />
        <circle cx="96" cy="31" r="1.7" />
        <circle cx="118" cy="50" r="1.1" />
      </g>
    </svg>
  );
}

export default DomeDrawing;
