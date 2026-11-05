/*
 * Wordmark — "skymap" in the display face, the tail of its y running on as a path that dips and climbs away
 * past the p, as a craft leaves on its trajectory. One drawing in em: it takes the size and colour of the text
 * it stands in, so the nav, the footer and the hero set it with font-size alone.
 */
import { useId } from 'react';

import styles from './Wordmark.module.css';
import { FADE, TRAIL, VIEW_BOX } from './Wordmark.constants.ts';

function Wordmark() {
  // An id per drawing: the nav and the footer both hold one.
  const fade = `trail-${useId().replace(/[^\w-]/g, '')}`;
  const { from, bend, to } = TRAIL;
  return (
    <svg className={styles.root} viewBox={VIEW_BOX.join(' ')} role="img" aria-label="Skymap">
      <defs>
        <linearGradient
          id={fade}
          gradientUnits="userSpaceOnUse"
          x1={from[0]}
          x2={to[0]}
          y1="0"
          y2="0"
        >
          <stop offset="0" stopColor={FADE[0]} />
          <stop offset="0.55" stopColor={FADE[1]} />
          <stop offset="1" stopColor={FADE[2]} />
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
