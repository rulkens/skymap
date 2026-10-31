/*
 * EarthRemark — the page's remark that every dome on Earth turns under the sky, beside the Earth that does the
 * turning: the planet cut from black, its night side toward the sentence, standing out past the window's left
 * edge in the empty half of the section. It drifts a little against the scroll.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './EarthRemark.module.css';

type EarthRemarkProps = { children: ReactNode };

function EarthRemark({ children }: EarthRemarkProps) {
  return (
    <div className={styles.root}>
      <div className={styles.earth} aria-hidden>
        <Shot id="cut-earth" sizes="(max-width: 900px) 40rem, 72rem" alt="" />
      </div>
      {children}
    </div>
  );
}

export default EarthRemark;
