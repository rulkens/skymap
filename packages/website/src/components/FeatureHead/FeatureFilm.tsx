/*
 * FeatureFilm — a loop in a disc, as on Home's places, under a group's name on
 * the Features page. It plays while half of its disc is on screen and stops when
 * it leaves; its button stops and starts it. The <video> is made the first time
 * it is to play, so a film never scrolled to is never fetched. A visitor who
 * asked for less motion or less data gets the still with a "Play film" button,
 * and nothing moves until they press it. Without script there is no film to stop, so no button.
 */
import { useEffect, useRef, useState } from 'react';

import { cx } from '../../utils/cx.ts';
import Shot from '../Shot/Shot.tsx';
import styles from './FeatureFilm.module.css';

type FeatureFilmProps = { src: string; still: string; says?: string };

function FeatureFilm({ src, still, says }: FeatureFilmProps) {
  const [ready, setReady] = useState(false);
  const [wanted, setWanted] = useState(true);
  const [seen, setSeen] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const screen = useRef<HTMLSpanElement>(null);
  const film = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    setWanted(!(connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches));
    setReady(true);
    const watch = new IntersectionObserver(([entry]) => setSeen(entry!.isIntersecting), {
      threshold: 0.5,
    });
    watch.observe(screen.current!);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (wanted && seen) setStarted(true);
    // Rejected when the film is stopped before it starts; nothing to do about it.
    if (wanted && seen) film.current?.play().catch(() => {});
    else film.current?.pause();
  }, [wanted, seen, started]);

  return (
    <div className={cx(styles.film, playing && styles.playing)}>
      <span className={styles.disc}>
        <span ref={screen} className={styles.screen}>
          <Shot id={still} sizes="9rem" alt="" />
          {started && (
            <video
              ref={film}
              src={src}
              muted
              loop
              playsInline
              disableRemotePlayback
              tabIndex={-1}
              aria-hidden="true"
              onPlaying={() => setPlaying(true)}
            />
          )}
        </span>
      </span>
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
