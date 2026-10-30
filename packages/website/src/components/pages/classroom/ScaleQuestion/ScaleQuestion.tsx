/*
 * ScaleQuestion — the classroom page's opening, which runs a lesson on the reader: Earth and the Moon at true
 * scale across the window, named as the app names them, one question, and the answer behind a disclosure.
 * Opening it lays thirty Earth-sized rings in the gap, so the answer is seen as well as read. Native
 * `details`, so it works without script. Narrow, the picture stands upright with the Moon above.
 */
import type { CSSProperties } from 'react';

import { ACCENTS, says } from '../../../../content/pages/classroom/classroom.data.ts';
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './ScaleQuestion.module.css';

const SHOT = 'class-earth-moon';
// One ring per Earth that fits the gap (the `earth-moon-in-earths` fact).
const RINGS = Array.from({ length: 30 }, (_, i) => i);

function ScaleQuestion() {
  return (
    <section
      className={styles.root}
      style={{ '--accent': ACCENTS.earth } as CSSProperties}
      data-opening
    >
      <div className={styles.words}>
        <h1>Use Skymap in the classroom</h1>
        <p className={styles.say}>
          Give your class a question and a link. The link opens Skymap, where pupils look up the
          answer, at true scale, in a browser.
        </p>
      </div>
      <figure className={styles.figure}>
        <div className={styles.frame}>
          <Shot id={SHOT} tall="class-earth-moon-tall" sizes="100vw" eager />
          <span className={styles.earth} aria-hidden="true">
            Earth
          </span>
          <span className={styles.moon} aria-hidden="true">
            Moon
          </span>
          <span className={styles.rings} aria-hidden="true">
            {RINGS.map((i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </span>
          <span className={styles.numeral} aria-hidden="true">
            30
          </span>
        </div>
        <div className={styles.ask}>
          <p className={styles.question}>How many Earths would fit between Earth and the Moon?</p>
          <details className={styles.answer}>
            <summary>Guess first, then show the answer</summary>
            <p>{says('earth-moon-in-earths')}</p>
          </details>
          <div className={styles.act}>
            <ViewLink hang href={appLink(siteShot(SHOT).link)}>
              Earth and the Moon
            </ViewLink>
          </div>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={SHOT} showDrawn={false} open={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default ScaleQuestion;
