/*
 * Lessons — Home's pitch for the classroom: four ways into a lesson, each a large picture (one a film of the
 * clock running), a question for the class and the link that opens where it is answered. The questions are
 * the classroom page's own (data/lessons.ts and its class features), so the two pages ask the same thing.
 * Wide, a large and a small picture to a row, crossing sides; narrow, the parts follow one another.
 */
import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { appLink } from '../../../../data/appLink.ts';
import { LESSON_TOPICS } from '../../../../data/lessons.ts';
import { cx } from '../../../../utils/cx.ts';
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

// `whole` keeps a picture of one panel uncut (it has its own edge). `film` plays the loop of the same id (data/siteLoops.ts) over its still, which gives the label.
const PARTS = [
  {
    title: 'Ready-made links',
    shot: earth.shot,
    ask: earth.ask,
    hash: earth.hash,
    action: earth.title,
    large: true,
  },
  {
    title: 'Run the clock',
    shot: 'features-time-jupiter',
    film: true,
    large: false,
    ask: clock.ask,
    hash: clock.hash,
    action: clock.action,
  },
  {
    title: 'Questions to chase',
    shot: 'home-search',
    ask: search.ask,
    hash: search.hash,
    large: false,
    whole: true,
  },
  {
    title: 'Feel the scale',
    shot: andromeda.shot,
    ask: andromeda.ask,
    hash: andromeda.hash,
    action: andromeda.title,
    large: true,
  },
];

// Six or seven of the page grid's twelve columns (`large`), or four or five; the whole width on a phone.
const sizes = (large: boolean) =>
  large
    ? '(max-width: 900px) 100vw, min(calc(58vw - 4rem), 41rem)'
    : '(max-width: 900px) 100vw, min(calc(42vw - 4rem), 29rem)';

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
            <figure className={cx(styles.figure, part.whole && styles.whole)}>
              <div className={styles.frame}>
                {part.film ? (
                  <FeatureFilm film={part.shot} sizes={sizes(part.large)} wide />
                ) : (
                  <Shot id={part.shot} sizes={sizes(part.large)} />
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
