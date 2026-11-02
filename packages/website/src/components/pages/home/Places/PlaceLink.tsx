/*
 * PlaceLink — one place: a disc that grows with its distance, its name and how
 * far away it is, all one link (not a ViewLink: the picture is part of the
 * target). Pointed at or focused, the disc gets the site's ring and plays its
 * film (DiscFilm); the ring's mark turns once round for each loop.
 */
import type { CSSProperties, Ref } from 'react';

import type { Place } from '../../../../@types/Place';
import { cx } from '../../../../utils/cx.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';
import AppLink from '../../../shared/links/AppLink/AppLink.tsx';
import DiscFilm from '../../../shared/media/DiscFilm/DiscFilm.tsx';
import Icon from '../../../shared/links/Icon/Icon.tsx';
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
  /** Pointed at or keyboard-focused, and left again; none when the film is not played on hover. */
  onPlay?: () => void;
  onStop?: () => void;
};

function PlaceLink({
  place,
  far,
  film,
  vars,
  className,
  playing,
  screenRef,
  onPlay,
  onStop,
}: PlaceLinkProps) {
  const words = place.name.split(' ');
  const head = words.slice(0, -1).join(' ');
  return (
    <li className={className} style={vars}>
      <AppLink
        className={cx(styles.thing, playing && styles.playing)}
        view={place.hash}
        onPointerEnter={onPlay}
        onPointerLeave={onStop}
        onFocus={(event) => event.currentTarget.matches(':focus-visible') && onPlay?.()}
        onBlur={onStop}
      >
        <DiscFilm
          className={styles.disc}
          still={place.shot}
          sizes={narrowSizes('45vw', '15vw')}
          film={film}
          playing={playing}
          screenRef={screenRef}
        >
          <svg className={styles.orbit} aria-hidden="true">
            <circle cx="50%" cy="50%" r="50%" />
          </svg>
          <i className={styles.mark} />
        </DiscFilm>
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
      </AppLink>
    </li>
  );
}

export default PlaceLink;
