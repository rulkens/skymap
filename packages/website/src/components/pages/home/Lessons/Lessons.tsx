/*
 * Lessons — Home's pitch for the classroom: four questions a pupil can answer by going there, ordered outward, each
 * under the thing it asks about, cut out of its own view and floated on the page. The first two stand on one
 * horizon at one scale: a small Earth on 21 June and Jupiter eleven times wider, a hairline drawn between them as
 * the section scrolls in. Then Orion with the app's search riding over it, and
 * Andromeda. The questions' views are the classroom page's own (data/lessons.ts and its class features). The section
 * stands on the field trip with no bus: Jezero crater across the window, the way in set in its sky, and
 * Perseverance, cut out with its shadow, driving up onto its own spot as the strip scrolls in. The words are
 * the page's: the title, the line under it (children), each question's and the way in.
 */
import type { ReactNode } from 'react';

import { cx } from '../../../../utils/cx.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import { SCALE_LABEL, VIEWS } from './Lessons.constants.ts';
import LessonAsk from './LessonAsk.tsx';
import styles from './Lessons.module.css';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

type LessonsProps = {
  title: string;
  /** Each question, its line and its link's words, keyed by the view that answers it. */
  asks: Record<keyof typeof VIEWS, { ask: string; line: string; action: string }>;
  /** The way into the classroom page, set in Jezero's sky. */
  more: { label: string; href: string };
  children: ReactNode;
};

function Lessons({ title, asks, more, children }: LessonsProps) {
  return (
    <section className={styles.root} id="classroom">
      <div className={styles.head}>
        <h2>{title}</h2>
        {children}
      </div>
      <div className={styles.near}>
        <figure className={styles.horizon}>
          <div className={styles.bodies}>
            <div className={styles.earth}>
              <Shot id="lessons-earth" sizes={narrowSizes('16vw', '5rem')} />
            </div>
            <div className={styles.span} aria-hidden />
            <div className={styles.jupiter}>
              <Shot id="lessons-jupiter" sizes={narrowSizes('145vw', '46rem')} />
            </div>
          </div>
          <figcaption className={styles.label}>
            <ShotCaption label={SCALE_LABEL} />
          </figcaption>
        </figure>
        <LessonAsk {...asks.earth} hash={VIEWS.earth} className={styles.first} />
        <LessonAsk {...asks.jupiter} hash={VIEWS.jupiter} className={styles.second} />
      </div>
      <div className={styles.far}>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.view}>
              <Shot id="features-constellations" sizes={narrowSizes('100vw', '36rem')} />
            </div>
            <div className={styles.search}>
              <Shot id="ui-search" sizes={narrowSizes('84vw', '26rem')} alt="" />
            </div>
          </figure>
          <LessonAsk {...asks.orion} hash={VIEWS.orion} />
        </div>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.view}>
              <Shot id="lesson-andromeda" sizes={narrowSizes('100vw', '36rem')} />
            </div>
          </figure>
          <LessonAsk {...asks.andromeda} hash={VIEWS.andromeda} />
        </div>
      </div>
      <figure className={styles.mars}>
        <div className={styles.ground}>
          <Shot id="mars-horizon" sizes={narrowSizes('260vw', '100vw')} />
        </div>
        <div className={cx(styles.rover, styles.shadow)}>
          <Shot id="lessons-perseverance" shadow sizes={narrowSizes('260vw', '100vw')} alt="" />
        </div>
        <div className={styles.rover}>
          <Shot id="lessons-perseverance" sizes={narrowSizes('260vw', '100vw')} alt="" />
        </div>
        <div className={styles.more}>
          <ObjLink hang href={more.href}>
            {more.label}
          </ObjLink>
        </div>
        <figcaption className={styles.marsCaption}>
          <ShotCaption id="mars-horizon" showDrawn={false} />
          <ShotCaption id="lessons-perseverance" showTitle={false} showDrawn={false} open={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default Lessons;
