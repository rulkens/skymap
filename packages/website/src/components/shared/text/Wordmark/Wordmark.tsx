/*
 * Wordmark — "skymap" in the display face, the tail of its y running on as a path that dips and climbs away
 * past the p, as a craft leaves on its trajectory. One drawing in em: it takes the size and colour of the text
 * it stands in, so the nav, the footer and the hero set it with font-size alone.
 */
import { useId } from 'react';

import styles from './Wordmark.module.css';

// The trail in the drawing's units (the face at 100, the baseline at 0), measured off the set word: it starts
// at the y's ball terminal and ends half an em past the p.
const TRAIL = { from: [92.25, 27.12], bend: [219.2, 43.79], to: [346.2, -4.54] } as const;

function Wordmark() {
  // An id per drawing: the nav and the footer both hold one.
  const fade = `trail-${useId().replace(/[^\w-]/g, '')}`;
  const { from, bend, to } = TRAIL;
  return (
    <svg className={styles.root} viewBox="-2 -82 352 113" role="img" aria-label="Skymap">
      <defs>
        <linearGradient id={fade} gradientUnits="userSpaceOnUse" x1={from[0]} x2={to[0]} y1="0" y2="0">
          <stop offset="0" stopColor="rgb(232 238 255 / 0.95)" />
          <stop offset="0.55" stopColor="rgb(200 220 255 / 0.45)" />
          <stop offset="1" stopColor="rgb(168 208 255 / 0)" />
        </linearGradient>
      </defs>
      <path
        className={styles.trail}
        d={`M ${from.join(' ')} Q ${bend.join(' ')} ${to.join(' ')}`}
        stroke={`url(#${fade})`}
      />
      <text className={styles.word} x="0" y="0" fontSize="100" aria-hidden="true">
        skymap
      </text>
    </svg>
  );
}

export default Wordmark;
