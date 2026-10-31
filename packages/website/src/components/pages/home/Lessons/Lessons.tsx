/*
 * Lessons — Home's pitch for the classroom: four questions a pupil can answer by going there, ordered outward, each
 * under the thing it asks about, cut out of its own view and floated on the page. The first two stand on one
 * horizon at one scale: a small Earth on 21 June and Jupiter eleven times wider, a hairline drawn between them as
 * the section scrolls in. Then Orion with the app's search riding over it, and
 * Andromeda. The questions are the classroom page's own (data/lessons.ts and its class features). The section
 * stands on the field trip with no bus: Jezero crater across the window, the way in set in its sky, and
 * Perseverance, cut out with its shadow, driving up onto its own spot as the strip scrolls in.
 */
import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { appLink } from '../../../../data/appLink.ts';
import { LESSON_TOPICS } from '../../../../data/lessons.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Lessons.module.css';

const lesson = (shot: string) =>
  LESSON_TOPICS.flatMap((topic) => topic.lessons).find((row) => row.shot === shot)!;
const feature = (shot: string) => CLASS_FEATURES.find((row) => row.shot === shot)!;

const EARTH = {
  ask: 'Can you see the North Pole on 21 June?',
  line: 'Earth as the Sun lit it that day. Ask what it means for the length of a day there.',
  hash: lesson('lesson-earth-june').hash,
  action: 'Earth on 21 June',
};
const JUPITER = {
  ask: 'How many times does Io go round while Europa goes round once?',
  line: 'Jupiter with the clock paused. Start it, speed it up and count.',
  hash: feature('class-time').hash,
  action: 'Jupiter and its moons',
};
const ORION = {
  ask: 'Which is farther away: Betelgeuse, or the centre of the Milky Way?',
  line: 'Orion and the stars around it. Pupils search for both and compare.',
  hash: feature('class-search').hash,
  action: 'Orion and its neighbours',
};
const ANDROMEDA = {
  ask: 'Had our species appeared when this light left Andromeda?',
  line: 'A photograph of Andromeda at its catalogued place. The light left 2.5 million years ago.',
  hash: lesson('lesson-andromeda').hash,
  action: 'Andromeda, the nearest large galaxy',
};
const SCALE_LABEL = {
  title: 'Earth and Jupiter at the same scale',
  credit: `${siteShot('lessons-earth').credit}. ${siteShot('lessons-jupiter').credit}`,
};

// A question with its line and the view that answers it.
const words = (part: typeof EARTH, className?: string) => (
  <div className={cx(styles.words, className)}>
    <h3>{part.ask}</h3>
    <p className={styles.line}>{part.line}</p>
    <ViewLink hang href={appLink(part.hash)}>
      {part.action}
    </ViewLink>
  </div>
);

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
        {words(EARTH, styles.first)}
        {words(JUPITER, styles.second)}
      </div>
      <div className={styles.far}>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.field}>
              <Shot id="features-constellations" sizes="(max-width: 900px) 100vw, 36rem" />
            </div>
            <div className={styles.search}>
              <Shot id="ui-search" sizes="(max-width: 900px) 84vw, 26rem" alt="" />
            </div>
          </figure>
          {words(ORION)}
        </div>
        <div className={styles.part}>
          <figure className={styles.figure}>
            <div className={styles.galaxy}>
              <Shot id="lesson-andromeda" sizes="(max-width: 900px) 100vw, 36rem" />
            </div>
          </figure>
          {words(ANDROMEDA)}
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
