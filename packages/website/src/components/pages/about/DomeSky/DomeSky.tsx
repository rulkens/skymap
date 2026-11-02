/*
 * DomeSky — a fisheye frame from the app's dome mode, large and round, run out past the window's left edge, with
 * the words (the children) on the right half of the page grid. As the page scrolls the frame turns about its
 * centre, the dome's zenith, the way the sky turns overhead. Its ring stands clear of the frame with nothing
 * painted between them, so the page's sky shows through. Narrow, the words come first and the frame follows.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './DomeSky.module.css';

const ID = 'dome-saturn';

type DomeSkyProps = { children: ReactNode };

function DomeSky({ children }: DomeSkyProps) {
  return (
    <div className={styles.root}>
      <figure className={styles.figure}>
        <div className={styles.ring}>
          <div className={styles.disc}>
            <Shot id={ID} sizes="(max-width: 900px) 100vw, min(44rem, 54vw, 85svh)" />
          </div>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={ID} showDrawn={false} />
        </figcaption>
      </figure>
      <div className={styles.words}>{children}</div>
    </div>
  );
}

export default DomeSky;
