/*
 * FeatureFilm — a loop in a disc, as on Home's places, under a group's name on
 * the Features page. It plays while half of its disc is on screen and stops when
 * it leaves; its button stops and starts it. A visitor who asked for less motion
 * or less data gets the still with a "Play film" button, and nothing moves until
 * they press it. Without script there is no film to stop, so no button.
 */
import { useEffect, useRef, useState } from 'react';

import { lessWanted } from '../../utils/lessWanted.ts';
import DiscFilm from '../DiscFilm/DiscFilm.tsx';
import styles from './FeatureFilm.module.css';

type FeatureFilmProps = { src: string; still: string; says?: string };

function FeatureFilm({ src, still, says }: FeatureFilmProps) {
  const [ready, setReady] = useState(false);
  const [wanted, setWanted] = useState(true);
  const [seen, setSeen] = useState(false);
  const screen = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const less = lessWanted();
    setWanted(!(less.data || less.motion));
    setReady(true);
    const watch = new IntersectionObserver(([entry]) => setSeen(entry!.isIntersecting), {
      threshold: 0.5,
    });
    watch.observe(screen.current!);
    return () => watch.disconnect();
  }, []);

  return (
    <div className={styles.film}>
      <DiscFilm
        className={styles.disc}
        still={still}
        sizes="9rem"
        film={src}
        playing={wanted && seen}
        screenRef={screen}
      />
      <div className={styles.words}>
        <p className={styles.says}>{says}</p>
        {ready && (
          <button className={styles.button} type="button" onClick={() => setWanted(!wanted)}>
            {wanted ? 'Pause film' : 'Play film'}
          </button>
        )}
      </div>
    </div>
  );
}

export default FeatureFilm;
