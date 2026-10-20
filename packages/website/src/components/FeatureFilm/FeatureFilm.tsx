/*
 * FeatureFilm — a loop of the loop manifest on the Features page, in a small disc or, `wide`, a 16:9
 * frame. It plays while half of it is on screen and stops when it leaves; its button stops and starts it.
 * A visitor who asked for less motion or less data gets the still with a "Play film" button, and nothing
 * moves until they press it. Without script there is no film to stop, so no button.
 */
import { useEffect, useRef, useState } from 'react';

import { SITE_LOOPS } from '../../data/siteLoops.ts';
import { cx } from '../../utils/cx.ts';
import { lessWanted } from '../../utils/lessWanted.ts';
import { loopUrl } from '../../utils/loopUrl.ts';
import DiscFilm from '../DiscFilm/DiscFilm.tsx';
import styles from './FeatureFilm.module.css';

type FeatureFilmProps = { film: string; sizes: string; wide?: boolean };

function FeatureFilm({ film, sizes, wide = false }: FeatureFilmProps) {
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

  // The film lies over the picture it starts from, so the two never differ when it begins.
  const still = SITE_LOOPS.find((loop) => loop.id === film)!.shot;
  return (
    <div className={cx(styles.root, wide && styles.wide)}>
      <DiscFilm
        className={styles.film}
        still={still}
        sizes={sizes}
        film={loopUrl(film)}
        playing={wanted && seen}
        screenRef={screen}
        wide={wide}
      />
      {ready && (
        <button className={styles.button} type="button" onClick={() => setWanted(!wanted)}>
          {wanted ? 'Pause film' : 'Play film'}
        </button>
      )}
    </div>
  );
}

export default FeatureFilm;
