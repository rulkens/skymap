/**
 * SkyEntryPreview — where "Look up from here" would stand: a ring at the view centre (the point
 * the entry facts are cast through) with the place and its coordinates beside it. Desktop only,
 * while the button is hovered or focused; it never takes the pointer.
 */

import type { ReactNode } from 'react';
import styles from './SkyEntryPreview.module.css';

export type SkyEntryPreviewProps = {
  /** Null when no named place is near: the coordinates are the whole label. */
  readonly place: string | null;
  readonly coordinates: string;
};

function SkyEntryPreview({ place, coordinates }: SkyEntryPreviewProps): ReactNode {
  return (
    <div className={styles.root} aria-hidden="true">
      <span className={styles.ring} />
      <span className={styles.tag}>
        {place !== null && <span className={styles.place}>{place}</span>}
        <span className={styles.coordinates}>{coordinates}</span>
      </span>
    </div>
  );
}

export default SkyEntryPreview;
