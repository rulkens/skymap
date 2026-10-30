/*
 * Lessons — Home's pitch for the classroom: four ways into a lesson, each a large picture (one a film of the
 * clock running), a question for the class and the link that opens where it is answered. The questions are
 * the classroom page's own (data/lessons.ts and its class features), so the two pages ask the same thing.
 * Wide, the second column stands lower than the first; narrow, the parts follow one another.
 */
import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { appLink } from '../../../../data/appLink.ts';
import { LESSON_TOPICS } from '../../../../data/lessons.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import SectionHead from '../../../shared/layout/SectionHead/SectionHead.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import FeatureFilm from '../../../shared/media/FeatureFilm/FeatureFilm.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Lessons.module.css';

const lesson = (shot: string) =>
  LESSON_TOPICS.flatMap((topic) => topic.lessons).find((row) => row.shot === shot)!;
const feature = (shot: string) => CLASS_FEATURES.find((row) => row.shot === shot)!;

const earth = lesson('lesson-earth-june');
const clock = feature('class-time');
const search = feature('class-search');
const andromeda = lesson('lesson-andromeda');

// `film` is a loop of data/siteLoops.ts shown in the picture's place; its label is its still's.
const PARTS = [
  {
    title: 'Ready-made links',
    shot: earth.shot,
    ask: earth.ask,
    hash: earth.hash,
    action: earth.title,
  },
  {
    title: 'Run the clock',
    shot: 'features-time-jupiter',
    film: true,
    ask: clock.ask,
    hash: clock.hash,
    action: clock.action,
  },
  { title: 'Questions to chase', shot: search.shot, ask: search.ask, hash: search.hash },
  {
    title: 'Feel the scale',
    shot: andromeda.shot,
    ask: andromeda.ask,
    hash: andromeda.hash,
    action: andromeda.title,
  },
];

// Half the page grid, less a gap; the whole width on a phone.
const SIZES = '(max-width: 900px) 100vw, min(calc(50vw - 4rem), 36rem)';

function Lessons() {
  return (
    <section className={styles.root} id="classroom">
      <SectionHead title="Use it in the classroom">
        <p>
          Give the class a link and a question. The link opens the view in a browser, with nothing
          to install.
        </p>
      </SectionHead>
      <div className={styles.parts}>
        {PARTS.map((part) => (
          <div key={part.title} className={styles.part}>
            <figure className={styles.figure}>
              <div className={styles.frame}>
                {part.film ? (
                  <FeatureFilm film={part.shot} sizes={SIZES} wide />
                ) : (
                  <Shot id={part.shot} sizes={SIZES} />
                )}
              </div>
              <figcaption className={styles.caption}>
                <ShotCaption id={part.shot} showDrawn={false} open={false} />
              </figcaption>
            </figure>
            <h3>{part.title}</h3>
            <p className={styles.ask}>{part.ask}</p>
            <ViewLink hang href={appLink(part.hash)}>
              {part.action}
            </ViewLink>
          </div>
        ))}
      </div>
      <ObjLink className={styles.more} hang href={sitePath('/classroom/')}>
        Use Skymap in the classroom
      </ObjLink>
    </section>
  );
}

export default Lessons;
