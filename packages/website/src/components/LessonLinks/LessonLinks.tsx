/*
 * LessonLinks — the ready-made lesson links as small cards on the page grid: the
 * picture, its topic, its name, one question, the picture's credit where it has
 * one, and the same Open this view link every picture label has.
 * Four to a row when wide; on an upright phone each is a row with its picture
 * small on the left.
 */
import { appLink } from '../../data/appLink.ts';
import { LESSON_TOPICS } from '../../data/lessons.ts';
import { siteShot } from '../../data/siteShot.ts';
import Shot from '../Shot/Shot.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './LessonLinks.module.css';

function LessonLinks() {
  return (
    <ul className={styles.root}>
      {LESSON_TOPICS.flatMap((topic) =>
        topic.lessons.map((lesson) => {
          const { credit } = siteShot(lesson.shot);
          return (
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
                {credit && <p className={styles.credit}>{credit}.</p>}
                <ViewLink href={appLink(lesson.hash)} />
              </div>
            </li>
          );
        }),
      )}
    </ul>
  );
}

export default LessonLinks;
