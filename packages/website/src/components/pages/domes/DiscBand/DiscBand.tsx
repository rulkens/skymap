/*
 * DiscBand — a page's opening section when its picture is a fisheye disc: the
 * words beside the disc with the dome's marks drawn over it, the disc's label
 * along the foot (`note` adds a line under it). The section is one screen tall
 * and the disc takes the height the label leaves, so the label is never pushed
 * off the screen. Narrow, the title and the lead come first, then the disc and
 * its label, then the rest.
 */
import type { ReactNode } from 'react';

import Disc from '../../../shared/media/Disc/Disc.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import DomeMarks from '../DomeMarks/DomeMarks.tsx';
import styles from './DiscBand.module.css';

type DiscBandProps = { id: string; note?: ReactNode; showDrawn?: boolean; children: ReactNode };

function DiscBand({ id, note, showDrawn = true, children }: DiscBandProps) {
  return (
    <section className={styles.root} data-opening>
      <div className={styles.words}>{children}</div>
      <figure>
        <div className={styles.room}>
          <div className={styles.fit} data-dome-turn>
            <Disc id={id} sizes="(max-width: 900px) 85vw, min(44rem, 62vh)" eager />
            <DomeMarks />
          </div>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={id} showDrawn={showDrawn} />
          {note}
        </figcaption>
      </figure>
    </section>
  );
}

export default DiscBand;
