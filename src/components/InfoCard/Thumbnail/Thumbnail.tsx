/**
 * Thumbnail — 80×80 px galaxy image shown in GalaxyDetailCard.
 * `loading="lazy"` defers fetch until the card is in the viewport.  On a load
 * error (404, CORS, network) we try `fallbackUrl` once, then swap to a
 * same-size placeholder so the surrounding layout doesn't reflow.
 *
 * The fallback chain serves famous galaxies: `url` is the curated tile and
 * `fallbackUrl` the galaxy catalog sky cutout, so a galaxy without a curated tile
 * still shows an image instead of the placeholder.
 *
 * When `href` is set, the image is wrapped in a link to an external 2D sky
 * viewer framed the same as the thumbnail, opened in a new tab.
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
  /** External sky-viewer link; wraps the image when present. */
  href?: string;
};

function Thumbnail({ url, fallbackUrl, href }: ThumbnailProps): ReactNode {
  const [src, setSrc] = useState(url);
  const [errored, setErrored] = useState(false);

  const image = errored ? (
    <div className={styles.placeholder} aria-label="No image available">
      no image
    </div>
  ) : (
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

  if (href === undefined) return image;

  return (
    <a
      className={styles.link}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in sky viewer"
    >
      {image}
    </a>
  );
}

export default Thumbnail;
