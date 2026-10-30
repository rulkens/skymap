/*
 * Lessons — Home's pitch for the classroom: four questions a pupil can answer by going there, each over the
 * picture of the view its link opens (one a film of the clock running) and a line on what the link sets up.
 * The questions are the classroom page's own (data/lessons.ts and its class features), put to the pupil. Wide,
 * two by two, every picture one shape and every row's parts on shared lines; narrow, one after another. The
 * section stands on the field trip with no bus: Jezero crater across the window, the way in set in its sky.
 */
import type { CSSProperties } from 'react';

import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { appLink } from '../../../../data/appLink.ts';
import { LESSON_TOPICS } from '../../../../data/lessons.ts';
import motion from '../../../../styles/motion.module.css';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import FeatureFilm from '../../../shared/media/FeatureFilm/FeatureFilm.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Lessons.module.css';

const lesson = (shot: string) =>
  LESSON_TOPICS.flatMap((topic) => topic.lessons).find((row) => row.shot === shot)!;
const feature = (shot: string) => CLASS_FEATURES.find((row) => row.shot === shot)!;

// `film` plays the loop of the same id (data/siteLoops.ts) over its still, which gives the label. `over` lays a
// control of the app, captured on a clear ground, over the picture: at its foot or at its `side`.
const PARTS = [
  {
    ask: 'Can you see the North Pole on 21 June?',
    line: 'Earth as the Sun lit it that day. Ask what it means for the length of a day there.',
    shot: 'lesson-earth-june',
    hash: lesson('lesson-earth-june').hash,
    action: 'Earth on 21 June',
  },
  {
    ask: 'How many times does Io go round while Europa goes round once?',
    line: 'Jupiter with the clock paused. Start it, speed it up and count.',
    shot: 'features-time-jupiter',
    film: true,
    over: { id: 'ui-timebar', side: false },
    hash: feature('class-time').hash,
    action: 'Jupiter and its moons',
  },
  {
    ask: 'Which is farther away: Betelgeuse, or the centre of the Milky Way?',
    line: 'Orion and the stars around it. Pupils search for both and compare.',
    shot: 'features-constellations',
    over: { id: 'ui-search', side: true },
    hash: feature('class-search').hash,
    action: 'Orion and its neighbours',
  },
  {
    ask: 'Had our species appeared when this light left Andromeda?',
    line: 'A photograph of Andromeda at its catalogued place. The light left 2.5 million years ago.',
    shot: 'lesson-andromeda',
    hash: lesson('lesson-andromeda').hash,
    action: 'Andromeda, the nearest large galaxy',
  },
];

// Half the page grid; the whole width on a phone.
const SIZES = '(max-width: 900px) 100vw, min(calc(50vw - 4rem), 36rem)';
// An overlay is at most half a picture.
const OVER_SIZES = '(max-width: 900px) 80vw, 18rem';
// The horizon strip spans the window; on a phone its 4:3 cut is taken from a strip 3.43 times as wide as tall.
const HORIZON_SIZES = '(max-width: 900px) 260vw, 100vw';

function Lessons() {
  return (
    <section className={styles.root} id="classroom">
      <div className={styles.head}>
        <h2>Use it in the classroom</h2>
        <p>
          Give the class a link and a question: a field trip with no bus, and nothing to install.
        </p>
      </div>
      <div className={styles.parts}>
        {PARTS.map((part, at) => (
          <div key={part.shot} className={styles.part}>
            <figure className={styles.figure}>
              <div
                className={cx(styles.frame, motion.unmask)}
                style={{ '--reveal-delay': `${(at % 2) * 80}ms` } as CSSProperties}
                data-reveal="unmask"
              >
                <div className={styles.ground}>
                  {part.film ? (
                    <FeatureFilm film={part.shot} sizes={SIZES} wide />
                  ) : (
                    <Shot id={part.shot} sizes={SIZES} />
                  )}
                </div>
                {part.over && (
                  <div className={cx(styles.over, part.over.side && styles.side)}>
                    <Shot id={part.over.id} sizes={OVER_SIZES} />
                  </div>
                )}
              </div>
              <figcaption className={styles.caption}>
                <ShotCaption id={part.shot} showDrawn={false} showTitle={false} open={false} />
              </figcaption>
            </figure>
            <div className={styles.words}>
              <h3>{part.ask}</h3>
              <p className={styles.line}>{part.line}</p>
            </div>
            <ViewLink hang href={appLink(part.hash)}>
              {part.action}
            </ViewLink>
          </div>
        ))}
      </div>
      <figure className={styles.field}>
        <div className={styles.horizon}>
          <Shot id="mars-horizon" sizes={HORIZON_SIZES} />
        </div>
        <div className={styles.more}>
          <ObjLink hang href={sitePath('/classroom/')}>
            Use Skymap in the classroom
          </ObjLink>
        </div>
        <figcaption className={styles.fieldCaption}>
          <ShotCaption id="mars-horizon" showDrawn={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default Lessons;
