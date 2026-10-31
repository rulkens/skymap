/*
 * SurveySpine — a survey's fan run down the margin beside the lists it holds (the children): its tip at the first
 * list's head, its far end at the last list's foot, so the page's length is the survey's depth. The scroll draws it
 * out from the tip. A narrow window has no margin, so the fan lies across it as a band over the lists (`band`).
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import { cx } from '../../../../utils/cx.ts';
import styles from './SurveySpine.module.css';

type SurveySpineProps = { id: string; band: string; children: ReactNode };

function SurveySpine({ id, band, children }: SurveySpineProps) {
  return (
    <div className={styles.root}>
      <figure className={styles.spine}>
        <figcaption className={styles.caption}>
          <ShotCaption id={id} />
        </figcaption>
        <div className={cx(styles.reach, styles.down)}>
          <div className={styles.fan}>
            <Shot id={id} sizes="28rem" />
          </div>
        </div>
        <div className={cx(styles.reach, styles.across)}>
          <div className={styles.fan}>
            <Shot id={band} sizes="min(130vw, 60rem)" />
          </div>
        </div>
      </figure>
      {children}
    </div>
  );
}

export default SurveySpine;
