/* Intro — the flight's first words: the wordmark and the page's line under it (`tagline`). They are the first stop's caption, and fade like the others. */
import type { ReactNode, Ref } from 'react';

import Wordmark from '../../../shared/text/Wordmark/Wordmark.tsx';
import styles from './Intro.module.css';

type IntroProps = { ref: Ref<HTMLDivElement>; tagline: ReactNode };

function Intro({ ref, tagline }: IntroProps) {
  return (
    <div ref={ref} className={styles.intro}>
      <div>
        <h1 className={styles.word}>
          <Wordmark />
        </h1>
        <p className={styles.tag}>{tagline}</p>
      </div>
    </div>
  );
}

export default Intro;
