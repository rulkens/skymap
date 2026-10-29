/*
 * FeatureFilm — a loop of the loop manifest on the Features page, in a small disc or, `wide`, a 16:9
 * frame. It plays while half of it is on screen and stops when it leaves; a wide film has a button over
 * its middle, shown on hover or focus, that stops and starts it. A visitor who asked for less motion or
 * less data gets the still, and only a wide film moves, when they press play. Without script there is
 * no film, so no button. `active` false holds it still (a slide of a gallery that is not the current one);
 * `href` makes the picture a link that lies under the button.
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { siteLoop } from '../../data/siteLoop.ts';
import { cx } from '../../utils/cx.ts';
import { lessWanted } from '../../utils/lessWanted.ts';
import { loopUrl } from '../../utils/loopUrl.ts';
import DiscFilm from '../DiscFilm/DiscFilm.tsx';
import Icon from '../Icon/Icon.tsx';
import styles from './FeatureFilm.module.css';

type FeatureFilmProps = {
  film: string;
  sizes: string;
  wide?: boolean;
  /** Whether the film may play; a gallery's other slides are held still. */
  active?: boolean;
  /** Where the picture leads, named for assistive technology by `linkLabel`. */
  href?: string;
  linkLabel?: string;
  /** The element that gets the film's `--turn`, where a neighbour moves with it. */
  turnOn?: RefObject<HTMLElement | null>;
};

function FeatureFilm({
  film,
  sizes,
  wide = false,
  active = true,
  href,
  linkLabel,
  turnOn,
}: FeatureFilmProps) {
  const [ready, setReady] = useState(false);
  const [wanted, setWanted] = useState(false);
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
  const still = siteLoop(film).shot;
  return (
    <div className={cx(styles.root, wide && styles.wide)}>
      <DiscFilm
        className={styles.film}
        still={still}
        sizes={sizes}
        film={loopUrl(film)}
        playing={wanted && seen && active}
        screenRef={screen}
        wide={wide}
        turnOn={turnOn}
      >
        {href && <a className={styles.open} href={href} aria-label={linkLabel} />}
        {ready && wide && (
          <button
            className={styles.button}
            type="button"
            aria-label={wanted ? 'Pause film' : 'Play film'}
            onClick={() => setWanted(!wanted)}
          >
            <Icon name={wanted ? 'pause' : 'play'} />
          </button>
        )}
      </DiscFilm>
    </div>
  );
}

export default FeatureFilm;
