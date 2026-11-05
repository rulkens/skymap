/*
 * DeliveryColumn — one way to get Skymap onto a dome: its picture with the picture's title, its one
 * figure set large, its name, a sentence or two (the children), its line of every row of the
 * specification (domes.data.ts) and one link, to the picture's view where a link can open it as shown
 * (shotLink). The picture is a fisheye disc: live, one that turns under a drag (domeTurn.client.ts), as
 * someone steers it; a film, its frame in front of the `earlier` frames, fanned out behind it to the
 * right, oldest furthest back. Its parts are rows of Delivery's grid (thirteen, the count `grid-row`
 * spans in the module), so they line up with the column beside it.
 */
import type { CSSProperties, ReactNode } from 'react';

import { DELIVERY_ROWS } from '../../../../content/pages/domes/domes.data.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { shotLink } from '../../../../utils/shotLink.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Disc from '../../../shared/media/Disc/Disc.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './DeliveryColumn.module.css';
import { SIZES } from './DeliveryColumn.constants.ts';

type DeliveryColumnProps = {
  kind: 'live' | 'film';
  title: string;
  shot: string;
  /** The column's one figure, set large, and what it measures. */
  figure: string;
  measure: string;
  /** A colour taken from the column's picture, for its figure and its rules. */
  accent: string;
  /** The words of the link that opens the picture's view. */
  action: string;
  /** Frames shown behind the picture, oldest first. */
  earlier?: string[];
  children: ReactNode;
};

function DeliveryColumn(props: DeliveryColumnProps) {
  const { kind, title, shot, figure, measure, accent, action, earlier = [], children } = props;
  const link = shotLink(shot);
  const turns = kind === 'live';
  return (
    <article className={styles.root} style={{ '--column-accent': accent } as CSSProperties}>
      <figure className={styles.figure}>
        <div className={styles.frames} style={{ '--count': earlier.length } as CSSProperties}>
          {earlier.map((id, i) => (
            <div
              key={id}
              className={styles.behind}
              style={{ '--depth': earlier.length - i } as CSSProperties}
            >
              <Shot id={id} sizes={SIZES} alt="" />
            </div>
          ))}
          <div
            className={turns ? styles.turning : styles.front}
            data-dome-turn={turns || undefined}
          >
            <Disc id={shot} sizes={SIZES} />
            {turns && (
              <svg className={styles.cue} viewBox="0 0 100 100" aria-hidden="true">
                <path d="M67.1 3A50 50 0 0 1 95.3 28.9M95.4 24.5 95.3 28.9 91.8 26.1" />
              </svg>
            )}
          </div>
        </div>
        <figcaption>
          <ShotCaption id={shot} showDrawn={false} open={false} />
        </figcaption>
      </figure>
      <p className={styles.readout}>
        <span className={styles.number}>{figure}</span>
        <span>{measure}</span>
      </p>
      <h3>{title}</h3>
      <div className={styles.words}>{children}</div>
      <dl className={styles.spec}>
        {DELIVERY_ROWS.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row[kind]}</dd>
          </div>
        ))}
      </dl>
      {link && (
        <ViewLink className={styles.link} hang view={link} query={siteShot(shot).query}>
          {action}
        </ViewLink>
      )}
    </article>
  );
}

export default DeliveryColumn;
