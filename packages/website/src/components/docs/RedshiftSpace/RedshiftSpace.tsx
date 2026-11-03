/*
 * RedshiftSpace — the diagram of a "finger of God": one cluster twice, as it
 * lies in space and as a map made from redshifts places it. The same dots are
 * drawn in both rows; in the second each is moved along the line of sight by
 * its own velocity, which is all the effect is. The rows' names and the
 * label are text outside the drawing, so they keep the page's sizes at every
 * width.
 */
import type { ReactNode } from 'react';

import { W, ROW, CENTRE, SUN, dots, rows } from './RedshiftSpace.constants.ts';
import styles from './RedshiftSpace.module.css';

type RedshiftSpaceProps = { label: string; children?: ReactNode };

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
