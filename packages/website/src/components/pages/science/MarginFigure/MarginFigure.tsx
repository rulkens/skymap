/*
 * MarginFigure — a cut-out in the page's right margin beside a Claims list (the children), out past the
 * statements to the window's edge, held in view while the list scrolls by. Narrow, it stands over the list.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './MarginFigure.module.css';

type MarginFigureProps = { id: string; children: ReactNode };

function MarginFigure({ id, children }: MarginFigureProps) {
  return (
    <div className={styles.root}>
      <div className={styles.margin}>
        <figure className={styles.held}>
          <div className={styles.subject}>
            <Shot id={id} sizes="(max-width: 900px) 100vw, 28rem" />
          </div>
          <figcaption className={styles.caption}>
            <ShotCaption id={id} />
          </figcaption>
        </figure>
      </div>
      {children}
    </div>
  );
}

export default MarginFigure;
