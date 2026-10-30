/*
 * DeliveryColumn — one way to get Skymap onto a dome: its picture with the picture's title, its one
 * figure set large, its name, a sentence or two (the children), its line of every row of the
 * specification (domes.data.ts) and one link, to the picture's view. `disc` shows the picture as a
 * fisheye frame. Its parts are rows of Delivery's grid (thirteen, the count `grid-row` spans in the
 * module), so they line up with the column beside it.
 */
import type { CSSProperties, ReactNode } from 'react';

import { DELIVERY_ROWS } from '../../../../content/pages/domes/domes.data.ts';
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Disc from '../../../shared/media/Disc/Disc.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './DeliveryColumn.module.css';

type DeliveryColumnProps = {
  kind: 'live' | 'film';
  title: string;
  shot: string;
  disc?: boolean;
  /** The column's one figure, set large, and what it measures. */
  figure: string;
  measure: string;
  /** A colour taken from the column's picture, for its figure and its rules. */
  accent: string;
  /** The words of the link that opens the picture's view. */
  action: string;
  children: ReactNode;
};

const SIZES = '(max-width: 900px) 100vw, min(calc(50vw - 4rem), 35rem)';

function DeliveryColumn(props: DeliveryColumnProps) {
  const { kind, title, shot, disc = false, figure, measure, accent, action, children } = props;
  return (
    <article className={styles.root} style={{ '--column-accent': accent } as CSSProperties}>
      <figure className={styles.figure}>
        <div className={disc ? styles.disc : styles.flat}>
          {disc ? (
            <Disc id={shot} sizes="(max-width: 900px) 70vw, 20rem" />
          ) : (
            <Shot id={shot} sizes={SIZES} />
          )}
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
      <ViewLink
        className={styles.link}
        hang
        href={appLink(siteShot(shot).link, siteShot(shot).query)}
      >
        {action}
      </ViewLink>
    </article>
  );
}

export default DeliveryColumn;
