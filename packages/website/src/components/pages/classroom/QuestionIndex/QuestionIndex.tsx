/*
 * QuestionIndex — the ready-made questions as an index, by topic, beside one large picture of the view the
 * question in hand opens. Pointing at or focusing a question brings its picture forward, ringed in a colour
 * from that picture; without script the first stays. Narrow, there is no viewer: each question carries a
 * small picture of its own. Each question's link names the view it opens.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { CLASS_QUESTIONS, says } from '../../../../content/pages/classroom/classroom.data.ts';
import { appLink } from '../../../../data/appLink.ts';
import { LESSON_TOPICS } from '../../../../data/lessons.ts';
import { cx } from '../../../../utils/cx.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './QuestionIndex.module.css';

const ROWS = CLASS_QUESTIONS.map((question) => {
  const topic = LESSON_TOPICS.find((t) => t.lessons.some((l) => l.shot === question.shot))!;
  const lesson = topic.lessons.find((l) => l.shot === question.shot)!;
  return { ...question, topic: topic.title, lesson };
});

const VIEWER_SIZES = '(max-width: 900px) 0px, min(calc(42vw - 4rem), 32rem)';

function QuestionIndex() {
  const [shown, setShown] = useState(0);
  return (
    <div className={styles.root} style={{ '--accent': ROWS[shown]!.accent } as CSSProperties}>
      <ol className={styles.list}>
        {ROWS.map((row, at) => (
          <li
            key={row.shot}
            className={cx(styles.row, at === shown && styles.shown)}
            style={{ '--row-accent': row.accent } as CSSProperties}
            onPointerEnter={() => setShown(at)}
            onFocus={() => setShown(at)}
          >
            {(at === 0 || ROWS[at - 1]!.topic !== row.topic) && (
              <p className={styles.topic}>{row.topic}</p>
            )}
            <div className={styles.thumb} aria-hidden="true">
              <Shot id={row.shot} sizes="(max-width: 900px) 5.5rem, 0px" alt="" />
            </div>
            <h3>{row.ask}</h3>
            {row.factId && <p className={styles.readout}>{says(row.factId)}</p>}
            <ViewLink href={appLink(row.lesson.hash)}>{row.lesson.title}</ViewLink>
          </li>
        ))}
      </ol>
      <figure className={styles.viewer} aria-hidden="true">
        <div className={styles.stack}>
          {ROWS.map((row, at) => (
            <div key={row.shot} className={cx(styles.slide, at === shown && styles.on)}>
              <Shot id={row.shot} sizes={VIEWER_SIZES} alt="" />
            </div>
          ))}
          <span className={styles.ring} />
        </div>
        <figcaption>
          <ShotCaption id={ROWS[shown]!.shot} showDrawn={false} open={false} />
        </figcaption>
      </figure>
    </div>
  );
}

export default QuestionIndex;
