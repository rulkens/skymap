/*
 * EarthOrbit — beside the question pupils answer as they leave, the orbit it asks about: the app's drawing of
 * the four inner orbits seen from above, cut from black, Earth's named where it comes nearest the question. The
 * orbits draw themselves outward from the Sun as the question scrolls in, Mercury's first and Mars' last.
 */
import type { CSSProperties } from 'react';

import { ACCENTS } from '../../../../content/pages/classroom/classroom.data.ts';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './EarthOrbit.module.css';

function EarthOrbit() {
  return (
    <div className={styles.root} style={{ '--earth': ACCENTS.earth } as CSSProperties} aria-hidden>
      <div className={styles.orbits}>
        <Shot id="orbits-inner" sizes="(max-width: 900px) 120vw, 64rem" alt="" />
      </div>
      <span className={styles.label}>Earth’s orbit</span>
    </div>
  );
}

export default EarthOrbit;
