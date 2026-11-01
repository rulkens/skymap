/* Intro — the flight's first words: the wordmark and what Skymap is. They are the first stop's caption, and fade like the others. */
import type { Ref } from 'react';

import styles from './Intro.module.css';

type IntroProps = { ref: Ref<HTMLDivElement> };

function Intro({ ref }: IntroProps) {
  return (
    <div ref={ref} className={styles.intro}>
      <div>
        <h1 className={styles.word}>skymap</h1>
        <p className={styles.tag}>
          Explore the universe in your browser,
          <br />
          At true scale.
        </p>
      </div>
    </div>
  );
}

export default Intro;
