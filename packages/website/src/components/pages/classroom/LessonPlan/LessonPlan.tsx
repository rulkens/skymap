/*
 * LessonPlan — a 45-minute lesson drawn as the app's clock bar, one stretch per part and as long as the
 * part, over the parts themselves: a picture, the routine, a question for the class and the link that opens
 * it. Pointing at a part lights its stretch of the bar (CSS only). It ends on the question pupils answer
 * as they leave, its answer behind a disclosure. Wide, the parts are two by two; narrow, one after another.
 */
import type { CSSProperties } from 'react';

import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { says } from '../../../../content/pages/classroom/classroom.data.ts';
import { appLink } from '../../../../data/appLink.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './LessonPlan.module.css';

const LESSON_MINUTES = CLASS_FEATURES.reduce((sum, part) => sum + part.minutes, 0);
// The minute each part starts at, for the bar's ticks.
const STARTS = CLASS_FEATURES.map((_, at) =>
  CLASS_FEATURES.slice(0, at).reduce((sum, part) => sum + part.minutes, 0),
);
const SIZES = '(max-width: 900px) 100vw, min(calc(50vw - 4rem), 36rem)';

function LessonPlan() {
  return (
    <div className={styles.root}>
      <ol className={styles.bar} aria-label={`A ${LESSON_MINUTES}-minute lesson`}>
        {CLASS_FEATURES.map((part, at) => (
          <li key={part.shot} style={{ '--minutes': part.minutes } as CSSProperties}>
            <a href={`#part-${at + 1}`}>
              <span className={styles.from}>{STARTS[at]} min</span>
              <span className={styles.name}>{part.title}</span>
            </a>
          </li>
        ))}
        <li className={styles.bell}>
          <a href="#leave">
            <span className={styles.from}>{LESSON_MINUTES} min</span>
          </a>
        </li>
      </ol>
      <div className={styles.parts}>
        {CLASS_FEATURES.map((part, at) => (
          <article key={part.shot} id={`part-${at + 1}`} className={styles.part}>
            <div className={styles.picture}>
              <Shot id={part.shot} tall={part.tall} sizes={SIZES} />
            </div>
            <p className={styles.prep}>
              {part.minutes} minutes. {part.prep}
            </p>
            <h3 data-n={at + 1}>{part.title}</h3>
            <p>
              {part.lesson} {part.factIds.map(says).join(' ')}
            </p>
            <p className={styles.label}>Ask the class</p>
            <p className={styles.ask}>{part.ask}</p>
            <ViewLink hang href={appLink(part.hash)}>
              {part.action}
            </ViewLink>
          </article>
        ))}
      </div>
      <aside id="leave" className={styles.leave}>
        <h3>Before they leave</h3>
        <p>Ask one question pupils answer from memory, without a screen.</p>
        <p className={styles.ask}>
          How far has Earth moved along its orbit since the lesson began?
        </p>
        <details className={styles.answer}>
          <summary>Show the answer</summary>
          <p>{says('earth-orbit-speed')}</p>
        </details>
      </aside>
    </div>
  );
}

export default LessonPlan;
