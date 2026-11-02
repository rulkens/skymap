/*
 * AboutHero — the About page's opening: the title and lead on the left of the page grid, and the Milky Way model
 * cut out as light beside them, run out past the window's right edge so the page's black is its sky. As the page
 * scrolls away the galaxy turns a little and falls behind the words. Narrow, the title and lead come first and
 * the galaxy follows them across the window.
 */
import type { ReactNode } from 'react';

import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './AboutHero.module.css';
import { ID } from './AboutHero.constants.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

type AboutHeroProps = { children: ReactNode };

function AboutHero({ children }: AboutHeroProps) {
  return (
    <section className={styles.root} data-opening="">
      <div className={styles.galaxy}>
        <Shot id={ID} sizes={narrowSizes('116vw', 'min(100vh, 62vw)')} eager />
      </div>
      <div className={styles.words}>{children}</div>
      <div className={styles.label}>
        <ShotCaption id={ID} showDrawn={false} />
      </div>
    </section>
  );
}

export default AboutHero;
