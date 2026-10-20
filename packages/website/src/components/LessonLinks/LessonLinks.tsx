/*
 * LessonLinks — the ready-made lesson links as small cards on the page grid: the
 * picture, its topic, its name, one question, what in the picture is data and
 * what is drawn, and the same Open this view link every picture label has.
 * Four to a row when wide; on an upright phone each is a row with its picture
 * small on the left.
 */
import { appLink } from '../../data/appLink.ts';
import { LESSON_TOPICS } from '../../data/lessons.ts';
import { siteShot } from '../../data/siteShot.ts';
import Shot from '../Shot/Shot.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './LessonLinks.module.css';

// A card has no room for the picture's full label: it keeps the line that says what is data and what is drawn.
const drawn = (id: string) =>
  [siteShot(id).drawn, siteShot(id).credit && `${siteShot(id).credit}.`].filter(Boolean).join(' ');

function LessonLinks() {
  return (
    <ul className={styles.root}>
      {LESSON_TOPICS.flatMap((topic) =>
        topic.lessons.map((lesson) => (
          <li key={lesson.hash}>
            <a
              className={styles.picture}
              href={appLink(lesson.hash)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <Shot
                id={lesson.shot}
                sizes="(max-width: 600px) 5.5rem, (max-width: 1100px) calc(50vw - 1.875rem), 15.75rem"
                alt=""
              />
            </a>
            <div>
              <p className={styles.topic}>{topic.title}</p>
              <h3>{lesson.title}</h3>
              <p className={styles.ask}>{lesson.ask}</p>
              <p className={styles.drawn}>{drawn(lesson.shot)}</p>
              <ViewLink href={appLink(lesson.hash)} />
            </div>
          </li>
        )),
      )}
    </ul>
  );
}

export default LessonLinks;
