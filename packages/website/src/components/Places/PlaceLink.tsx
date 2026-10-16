/*
 * PlaceLink — one place: a disc that grows with its distance, its name and how
 * far away it is, all one link (not a ViewLink: the picture is part of the
 * target). Pointed at or focused, the disc gets the site's ring and plays its
 * film; the film is made the first time it plays and lies over the disc's still.
 * While it plays, `--turn` on the link is how far through the loop it is (0 to 1).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';

import { appLink } from '../../data/appLink.ts';
import type { Place } from '../../@types/Place';
import { cx } from '../../utils/cx.ts';
import Icon from '../Icon/Icon.tsx';
import Shot from '../Shot/Shot.tsx';
import styles from './Places.module.css';

type PlaceLinkProps = {
  place: Place;
  /** The words under the name: how far away it is. */
  far: string;
  film?: string;
  /** Where the disc stands, in units of the field, tall and wide, and which way its label hangs. */
  vars: CSSProperties;
  className: string;
  playing: boolean;
  screenRef: Ref<HTMLSpanElement>;
  handlers: {
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    onFocus?: (focusVisible: boolean) => void;
    onBlur?: () => void;
  };
};

function PlaceLink({
  place,
  far,
  film,
  vars,
  className,
  playing,
  screenRef,
  handlers,
}: PlaceLinkProps) {
  const words = place.name.split(' ');
  const head = words.slice(0, -1).join(' ');
  const [started, setStarted] = useState(false);
  const [shown, setShown] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!playing) {
      video.current?.pause();
      return;
    }
    setStarted(true);
    // Rejected when the film is stopped before it starts; nothing to do about it.
    video.current?.play().catch(() => {});
    let frame = 0;
    const follow = (): void => {
      const film = video.current;
      if (film?.duration)
        link.current!.style.setProperty('--turn', (film.currentTime / film.duration).toFixed(4));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [playing, started]);

  return (
    <li className={className} style={vars}>
      <a
        ref={link}
        className={cx(styles.thing, playing && styles.playing, shown && styles.shown)}
        href={appLink(place.hash)}
        onPointerEnter={handlers.onPointerEnter}
        onPointerLeave={handlers.onPointerLeave}
        onFocus={(event) => handlers.onFocus?.(event.currentTarget.matches(':focus-visible'))}
        onBlur={handlers.onBlur}
      >
        <span className={styles.disc}>
          <span ref={screenRef} className={styles.screen}>
            <Shot id={place.shot} sizes="(min-width: 901px) 15vw, 45vw" alt="" />
            {film && started && (
              <video
                ref={video}
                src={film}
                muted
                loop
                playsInline
                disableRemotePlayback
                tabIndex={-1}
                aria-hidden="true"
                // Shown only once it has a frame to show, so the still never gives way to an empty box.
                onPlaying={() => setShown(true)}
              />
            )}
          </span>
          <svg className={styles.orbit} aria-hidden="true">
            <circle cx="50%" cy="50%" r="50%" />
          </svg>
          <i className={styles.mark} />
        </span>
        <span className={styles.text}>
          <b className={styles.name}>
            {head}{' '}
            <span className={styles.last}>
              {words.at(-1)}
              <Icon name="view" />
            </span>
          </b>
          <span className={styles.far}>{far}</span>
        </span>
      </a>
    </li>
  );
}

export default PlaceLink;
