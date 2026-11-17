/*
 * ControlFigure — `<Control piece="…" keys={[['H', 'fly home']]} />` on a docs
 * page, under the step that uses it: one control of the app alone on
 * transparency, drawn at its size in the app, which is its row's narrowest file
 * (data/siteShots.ts), with the keys that work it, each with what it does.
 */
import type { CSSProperties } from 'react';

import { siteShot } from '../../../data/siteShot.ts';
import Keys from '../Keys/Keys.tsx';
import Shot from '../../shared/media/Shot/Shot.tsx';
import styles from './ControlFigure.module.css';

type ControlFigureProps = {
  piece: string;
  keys?: readonly (readonly [string, string])[];
};

function ControlFigure({ piece, keys = [] }: ControlFigureProps) {
  const size = Math.min(...siteShot(piece).widths);
  return (
    <div className={styles.root} data-embed>
      <div className={styles.piece} style={{ '--piece': `${size}px` } as CSSProperties}>
        <Shot id={piece} sizes={`${size}px`} />
      </div>
      {keys.length > 0 && (
        <dl className={styles.keys}>
          {keys.map(([of, does]) => (
            <div key={of} className={styles.key}>
              <dt>
                <Keys of={of} />
              </dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default ControlFigure;
