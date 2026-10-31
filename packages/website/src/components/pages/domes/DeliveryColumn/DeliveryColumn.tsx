/*
 * DeliveryColumn — one way to get Skymap onto a dome: its picture with the picture's title, its one
 * figure set large, its name, a sentence or two (the children), its line of every row of the
 * specification (domes.data.ts) and one link, to the picture's view. Both columns' pictures stand in
 * the same square mount, the shape of a dome frame, so the pair reads as one kind of thing. Its parts
 * are rows of Delivery's grid (thirteen, the count `grid-row` spans in the module), so they line up
 * with the column beside it.
 */
import type { CSSProperties, ReactNode } from 'react';

import { DELIVERY_ROWS } from '../../../../content/pages/domes/domes.data.ts';
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './DeliveryColumn.module.css';

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
  children: ReactNode;
};

/** The mount's widest, in rem (`.mount` in the module); a wide picture fills its height, so it loads that much wider. */
const MOUNT_REM = 22;

function DeliveryColumn(props: DeliveryColumnProps) {
  const { kind, title, shot, figure, measure, accent, action, children } = props;
  const { size, link, query } = siteShot(shot);
  const spread = Math.max(1, size.width / size.height);
  // A phone's 100vw understates a wide picture on purpose: at 3x the full width would fetch the desktop file.
  const sizes = `(max-width: 900px) 100vw, ${Math.ceil(MOUNT_REM * spread)}rem`;
  return (
    <article className={styles.root} style={{ '--column-accent': accent } as CSSProperties}>
      <figure className={styles.figure}>
        <div className={styles.mount}>
          <Shot id={shot} sizes={sizes} />
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
      <ViewLink className={styles.link} hang href={appLink(link, query)}>
        {action}
      </ViewLink>
    </article>
  );
}

export default DeliveryColumn;
