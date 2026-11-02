/*
 * Lessons — Home's pitch for the classroom: four questions a pupil can answer by going there, ordered outward, each
 * under the thing it asks about, cut out of its own view and floated on the page. The first two stand on one
 * horizon at one scale: a small Earth on 21 June and Jupiter eleven times wider, a hairline drawn between them as
 * the section scrolls in. Then Orion with the app's search riding over it, and
 * Andromeda. The questions are the classroom page's own (data/lessons.ts and its class features). The section
 * stands on the field trip with no bus: Jezero crater across the window, the way in set in its sky, and
 * Perseverance, cut out with its shadow, driving up onto its own spot as the strip scrolls in.
 */
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import { ANDROMEDA, EARTH, JUPITER, ORION, SCALE_LABEL } from './Lessons.constants.ts';
import LessonAsk from './LessonAsk.tsx';
import styles from './Lessons.module.css';

function Lessons() {
  return (
    <section className={styles.root} id="classroom">
      <div className={styles.head}>
        <h2>Use it in the classroom</h2>
        <p>
          Give the class a link and a question: a field trip with no bus, and nothing to install.
        </p>
      </div>
      <div className={styles.near}>
        <figure className={styles.horizon}>
          <div className={styles.bodies}>
            <div className={styles.earth}>
              <Shot id="lessons-earth" sizes="(max-width: 900px) 16vw, 5rem" />
            </div>
            <div className={styles.span} aria-hidden />
            <div className={styles.jupiter}>
              <Shot id="lessons-jupiter" sizes="(max-width: 900px) 145vw, 46rem" />
            </div>
          </div>
          <figcaption className={styles.label}>
            <ShotCaption label={SCALE_LABEL} />
          </figcaption>
        </figure>
        <LessonAsk {...EARTH} className={styles.first} />
        <LessonAsk {...JUPITER} className={styles.second} />
      </div>
      <div className={styles.far}>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.view}>
              <Shot id="features-constellations" sizes="(max-width: 900px) 100vw, 36rem" />
            </div>
            <div className={styles.search}>
              <Shot id="ui-search" sizes="(max-width: 900px) 84vw, 26rem" alt="" />
            </div>
          </figure>
          <LessonAsk {...ORION} />
        </div>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.view}>
              <Shot id="lesson-andromeda" sizes="(max-width: 900px) 100vw, 36rem" />
            </div>
          </figure>
          <LessonAsk {...ANDROMEDA} />
        </div>
      </div>
      <figure className={styles.mars}>
        <div className={styles.ground}>
          <Shot id="mars-horizon" sizes="(max-width: 900px) 260vw, 100vw" />
        </div>
        <div className={cx(styles.rover, styles.shadow)}>
          <Shot id="lessons-perseverance" shadow sizes="(max-width: 900px) 260vw, 100vw" alt="" />
        </div>
        <div className={styles.rover}>
          <Shot id="lessons-perseverance" sizes="(max-width: 900px) 260vw, 100vw" alt="" />
        </div>
        <div className={styles.more}>
          <ObjLink hang href={sitePath('/classroom/')}>
            Use Skymap in the classroom
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
