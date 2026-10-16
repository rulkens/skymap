/*
 * Stops — the flight's stops, each one list item holding its still and its
 * caption, so the words cannot drift from the picture. On the stage they lie on
 * one another and the scroll fades between them; a still two stops away is not
 * fetched yet (`near`). Without script the list reads top to bottom as
 * captioned pictures. The first stop's words are the intro.
 */
import type { RefObject } from 'react';

import type { FlightStopView } from '../../@types/FlightStopView';
import { cx } from '../../utils/cx.ts';
import styles from './Stops.module.css';

type StopsProps = {
  stops: readonly FlightStopView[];
  /** The stops whose still the browser may fetch. */
  near: ReadonlySet<number>;
  pictures: RefObject<(HTMLElement | null)[]>;
  captions: RefObject<(HTMLElement | null)[]>;
};

function Stops({ stops, near, pictures, captions }: StopsProps) {
  return (
    <ol className={styles.stops}>
      {stops.map(({ id, name, line, alt, still }, i) => (
        <li key={id} className={cx(styles.stop, near.has(i) && styles.near)}>
          <picture
            ref={(el) => {
              pictures.current[i] = el;
            }}
          >
            <source
              media="(orientation: portrait)"
              type="image/avif"
              srcSet={still.portrait.avif}
              sizes={still.portrait.sizes}
            />
            <source
              media="(orientation: portrait)"
              type="image/webp"
              srcSet={still.portrait.webp}
              sizes={still.portrait.sizes}
            />
            <source type="image/avif" srcSet={still.landscape.avif} sizes={still.landscape.sizes} />
            <source type="image/webp" srcSet={still.landscape.webp} sizes={still.landscape.sizes} />
            <img
              src={still.landscape.src}
              width={still.landscape.width}
              height={still.landscape.height}
              alt={alt}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : undefined}
              decoding="async"
            />
          </picture>
          {i > 0 && (
            <div
              ref={(el) => {
                captions.current[i] = el;
              }}
              className={styles.cap}
            >
              <p className={styles.name}>{name}</p>
              {line && <p className={styles.line}>{line}</p>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default Stops;
