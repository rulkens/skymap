/**
 * Thumbnail — 80×80 px SDSS image cutout shown in the FullCard.  `loading="lazy"`
 * defers fetch until the card is in the viewport.  On any error (404, CORS,
 * network) we swap to a same-size placeholder so the surrounding layout
 * doesn't reflow.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Thumbnail.module.css';

export type ThumbnailProps = {
  ra: number;
  dec: number;
  url: string;
};

export function Thumbnail({ url }: ThumbnailProps): ReactNode {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className={styles.thumbPlaceholder} aria-label="No image available">
        no image
      </div>
    );
  }

  return (
    <img
      className={styles.thumbImg}
      src={url}
      alt="SDSS cutout"
      width={80}
      height={80}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}
