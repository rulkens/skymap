/*
 * Places — nine places to start from, nearest first, hung on one hairline out
 * from Earth (PlaceLink): each a disc that grows with its distance, its name
 * and how far away it is. Scrolling draws the line and drifts the discs
 * (usePlaceDrift); pointed at, a disc plays its film (usePlaceFilms). Layout in
 * placeLayout.ts. It is an island: the films and the drift need the page.
 */
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import { PLACES } from '../../data/places.ts';
import { cx } from '../../utils/cx.ts';
import { loopUrl } from '../../utils/loopUrl.ts';
import { smoothPath } from '../../utils/smoothPath.ts';
import PlaceLink from './PlaceLink.tsx';
import { DEPTHS, TALL, TALL_HEIGHT, WIDE, WIDE_HEIGHT } from './placeLayout.ts';
import styles from './Places.module.css';
import { usePlaceDrift } from './usePlaceDrift.ts';
import { usePlaceFilms } from './usePlaceFilms.ts';

const FILMS = PLACES.map((place) => (place.loop ? loopUrl(place.loop) : undefined));
const IDS = PLACES.map((place) => place.id);
const tallHeight = TALL_HEIGHT.toFixed(2);

/** `lines`: the words under each name, from placeLines() on the page. */
type PlacesProps = { lines: readonly string[] };

function Places({ lines }: PlacesProps) {
  const field = useRef<HTMLDivElement>(null);
  usePlaceDrift(field);
  const films = usePlaceFilms(IDS);

  return (
    <section className={styles.root} id="places">
      <div className={styles.head}>
        <h2>Pick somewhere to start</h2>
        <p>
          Choose one and the app opens there. They run from nearest to farthest: light from the Moon
          arrives in 1.3 seconds, from Andromeda in 2.5 million years.
        </p>
      </div>
      <div
        ref={field}
        className={styles.field}
        style={{ '--tall-height': tallHeight, '--wide-height': WIDE_HEIGHT } as CSSProperties}
      >
        <svg
          className={cx(styles.thread, styles.tall)}
          viewBox={`0 0 100 ${tallHeight}`}
          aria-hidden="true"
        >
          <path
            d={smoothPath(
              TALL.map((p) => [p.x, p.y]),
              0.9,
            )}
            pathLength="1"
          />
        </svg>
        <svg
          className={cx(styles.thread, styles.wide)}
          viewBox={`0 0 1000 ${WIDE_HEIGHT}`}
          aria-hidden="true"
        >
          <path
            d={smoothPath(
              WIDE.map((p) => [p.x, p.y]),
              0.9,
            )}
            pathLength="1"
          />
        </svg>
        <ol>
          {PLACES.map((place, i) => {
            const tall = TALL[i]!;
            const wide = WIDE[i]!;
            const hover = films.mode === 'hover' && FILMS[i];
            return (
              <PlaceLink
                key={place.id}
                place={place}
                far={lines[i]!}
                film={FILMS[i]}
                className={cx(
                  styles.item,
                  styles[tall.side],
                  styles[wide.row],
                  wide.hang !== 'center' && styles[wide.hang],
                )}
                vars={
                  {
                    '--tx': tall.x,
                    '--ty': tall.y.toFixed(2),
                    '--td': tall.d,
                    '--room': tall.room,
                    '--wx': wide.x,
                    '--wy': wide.y,
                    '--wd': wide.d,
                    '--depth': DEPTHS[i],
                  } as CSSProperties
                }
                playing={films.current === place.id}
                screenRef={(el) => {
                  if (el) films.screens.current.set(place.id, el);
                  else films.screens.current.delete(place.id);
                }}
                handlers={
                  hover
                    ? {
                        onPointerEnter: () => films.play(place.id),
                        onPointerLeave: () => films.stop(place.id),
                        onFocus: (focusVisible) => focusVisible && films.play(place.id),
                        onBlur: () => films.stop(place.id),
                      }
                    : {}
                }
              />
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default Places;
