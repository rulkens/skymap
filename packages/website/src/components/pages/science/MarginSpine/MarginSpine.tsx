/*
 * MarginSpine — a cut-out of light run down the margin beside the lists it holds (the children), from the first
 * list's head to the last list's foot, its height theirs and its width the picture's own. The scroll draws it out
 * from the top. A narrow window has no margin: there `band`, the same subject framed wide, lies across the window
 * over the lists, and without a `band` the picture is left out.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import { cx } from '../../../../utils/cx.ts';
import styles from './MarginSpine.module.css';

type MarginSpineProps = { id: string; band?: string; children: ReactNode };

function MarginSpine({ id, band, children }: MarginSpineProps) {
  return (
    <div className={styles.root}>
      <figure className={cx(styles.spine, !band && styles['margin-only'])}>
        <figcaption className={styles.caption}>
          <ShotCaption id={id} />
        </figcaption>
        <div className={cx(styles.reach, styles.down)}>
          <div className={styles.hold}>
            <Shot id={id} sizes="28rem" />
          </div>
        </div>
        {band && (
          <div className={cx(styles.reach, styles.across)}>
            <div className={styles.hold}>
              <Shot id={band} sizes="min(130vw, 60rem)" />
            </div>
          </div>
        )}
      </figure>
      {children}
    </div>
  );
}

export default MarginSpine;
