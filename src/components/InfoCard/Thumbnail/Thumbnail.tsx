/**
 * Thumbnail — 80×80 px galaxy image shown in GalaxyDetailCard.
 * `loading="lazy"` defers fetch until the card is in the viewport.  On a load
 * error (404, CORS, network) we try `fallbackUrl` once, then swap to a
 * same-size placeholder so the surrounding layout doesn't reflow.
 *
 * The fallback chain serves famous galaxies: `url` is the curated tile and
 * `fallbackUrl` the galaxy catalog sky cutout, so a galaxy without a curated tile
 * still shows an image instead of the placeholder.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Thumbnail.module.css';

export type ThumbnailProps = {
  ra: number;
  dec: number;
  url: string;
  /** Tried once if `url` fails to load (e.g. a missing curated tile). */
  fallbackUrl?: string;
};

function Thumbnail({ url, fallbackUrl }: ThumbnailProps): ReactNode {
  const [src, setSrc] = useState(url);
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className={styles.placeholder} aria-label="No image available">
        no image
      </div>
    );
  }

  return (
    <img
      className={styles.root}
      src={src}
      alt="Galaxy thumbnail"
      width={80}
      height={80}
      loading="lazy"
      onError={() => {
        if (fallbackUrl !== undefined && src !== fallbackUrl) setSrc(fallbackUrl);
        else setErrored(true);
      }}
    />
  );
}

export default Thumbnail;
