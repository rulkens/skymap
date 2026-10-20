/*
 * DiscBand — a page's opening section when its picture is a fisheye disc: the
 * words beside the disc, the disc's label along the foot (`note` adds a line
 * under it). The section is one screen tall and the disc takes the height the
 * label leaves, so the label is never pushed off the screen. Narrow, the title
 * and the lead come first, then the disc and its label, then the rest.
 */
import type { ReactNode } from 'react';

import Disc from '../Disc/Disc.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './DiscBand.module.css';

type DiscBandProps = { id: string; note?: ReactNode; children: ReactNode };

function DiscBand({ id, note, children }: DiscBandProps) {
  return (
    <section className={styles.root} data-opening>
      <div className={styles.words}>{children}</div>
      <figure>
        <div className={styles.room}>
          <div className={styles.fit}>
            <Disc id={id} sizes="(max-width: 900px) 85vw, min(44rem, 62vh)" eager />
          </div>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={id} />
          {note}
        </figcaption>
      </figure>
    </section>
  );
}

export default DiscBand;
