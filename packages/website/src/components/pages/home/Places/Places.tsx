/*
 * Places — nine places to start from, nearest first, hung on one hairline out
 * from Earth (PlaceLink): each a disc that grows with its distance, its name
 * and how far away it is. Scrolling draws the line and drifts the discs
 * (usePlaceDrift); pointed at, a disc plays its film (usePlaceFilms). Layout in
 * placeLayout.ts. It is an island: the films and the drift need the page.
 * The title and the line under it (children) are the page's.
 */
import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { PLACES } from '../../../../content/pages/home/places.ts';
import { cx } from '../../../../utils/cx.ts';
import { smoothPath } from '../../../../utils/smoothPath.ts';
import PlaceLink from './PlaceLink.tsx';
import { DEPTHS, TALL, WIDE, WIDE_HEIGHT } from './placeLayout.ts';
import styles from './Places.module.css';
import { usePlaceDrift } from './usePlaceDrift.ts';
import { usePlaceFilms } from './usePlaceFilms.ts';
import { FILMS, IDS, tallHeight } from './Places.constants.ts';

/** `lines`: the words under each name, from placeLines() on the page. */
type PlacesProps = { title: string; lines: readonly string[]; children: ReactNode };

function Places({ title, lines, children }: PlacesProps) {
  const field = useRef<HTMLDivElement>(null);
  usePlaceDrift(field);
  const films = usePlaceFilms(IDS);

  return (
    <section className={styles.root} id="places">
      <div className={styles.head}>
        <h2>{title}</h2>
        {children}
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
        <ol className={styles.bare}>
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
                onPlay={hover ? () => films.play(place.id) : undefined}
                onStop={hover ? () => films.stop(place.id) : undefined}
              />
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default Places;
