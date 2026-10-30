/*
 * WebAtScale — the words (the children) on the left of the page grid, and beside them the cosmic web's traced
 * filaments as light, out past the column to the window's edge, with the app's own scale bar laid over them. The
 * bar was taken at the picture's camera in a window of the picture's shape, so it is set at the same fraction of
 * the picture's width it had of the window's, and measures the picture truly. The web and the bar drift at their
 * own depths with the scroll. Narrow, the web stands under the words and the bar, too small to read, is left out.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './WebAtScale.module.css';

type WebAtScaleProps = { children: ReactNode };

function WebAtScale({ children }: WebAtScaleProps) {
  return (
    <div className={styles.root}>
      <div className={styles.words}>{children}</div>
      <figure className={styles.figure}>
        <div className={styles.web}>
          <Shot id="about-web" sizes="(max-width: 900px) 150vw, 76rem" />
        </div>
        <div className={styles.bar}>
          <Shot id="about-scale-bar" sizes="14rem" />
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id="about-web" />
        </figcaption>
      </figure>
    </div>
  );
}

export default WebAtScale;
