/*
 * RedshiftSpace — the diagram of a "finger of God": one cluster twice, as it
 * lies in space and as a map made from redshifts places it. The same dots are
 * drawn in both rows; in the second each is moved along the line of sight by
 * its own velocity, which is all the effect is. The rows' names and the
 * label are text outside the drawing, so they keep the page's sizes at every
 * width.
 */
import type { ReactNode } from 'react';

import styles from './RedshiftSpace.module.css';

type RedshiftSpaceProps = { label: string; children?: ReactNode };

type Dot = { x: number; y: number; shift: number };

const W = 360;
const ROW = 96;
const CENTRE = 214;
const RADIUS = 20;
const STRETCH = 6.5;
// The ring's left edge is the text's.
const SUN = 5;

// Mulberry32: the dots must be the same on every build, and the same in both rows.
const dots: readonly Dot[] = (() => {
  let seed = 20261007;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 46 }, () => {
    const r = RADIUS * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    // The sum of three draws is close enough to the bell curve of velocities in a cluster.
    const velocity = (random() + random() + random()) / 1.5 - 1;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), shift: velocity * RADIUS * STRETCH };
  });
})();

const rows = [
  { name: 'In space', y: ROW / 2, at: (dot: Dot) => dot.x },
  { name: 'In a map made from redshifts', y: ROW * 1.5, at: (dot: Dot) => dot.x + dot.shift },
];

function RedshiftSpace({ label, children }: RedshiftSpaceProps) {
  return (
    <figure className={styles.root} data-embed>
      <div className={styles.rows}>
        {rows.map((row, i) => (
          <span
            key={row.name}
            className={styles.row}
            style={{ top: `${(i * 100) / rows.length}%` }}
          >
            {row.name}
          </span>
        ))}
        <svg viewBox={`0 0 ${W} ${ROW * 2}`} role="img" aria-label={label}>
          {rows.map((row) => (
            <g key={row.name}>
              <line className={styles.sight} x1={SUN + 4.5} y1={row.y} x2={W} y2={row.y} />
              <circle className={styles.us} cx={SUN} cy={row.y} r="4.5" />
              {dots.map((dot, i) => (
                <circle
                  key={i}
                  className={styles.dot}
                  cx={(CENTRE + row.at(dot)).toFixed(1)}
                  cy={(row.y + dot.y).toFixed(1)}
                  r="1.6"
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <figcaption className={styles.caption}>{children}</figcaption>
    </figure>
  );
}

export default RedshiftSpace;
