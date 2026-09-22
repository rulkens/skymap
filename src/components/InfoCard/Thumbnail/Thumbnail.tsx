/**
 * Thumbnail — 80×80 px image shown in a detail card (galaxy, body, Milky Way).
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
 *
 * The host card stays mounted across target changes (palette search), so the
 * state is reset in-render whenever `url` differs from the one it was seeded for.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Thumbnail.module.css';

export type ThumbnailProps = {
  url: string;
  /** Tried once if `url` fails to load (e.g. a missing curated tile). */
  fallbackUrl?: string;
  /** External sky-viewer link; wraps the image when present. */
  href?: string;
  alt: string;
};

function Thumbnail({ url, fallbackUrl, href, alt }: ThumbnailProps): ReactNode {
  const [state, setState] = useState({ forUrl: url, src: url, errored: false });

  if (state.forUrl !== url) {
    setState({ forUrl: url, src: url, errored: false });
  }
  const { src, errored } = state;

  const image = errored ? (
    <div className={styles.placeholder} aria-label="No image available">
      no image
    </div>
  ) : (
    <img
      className={styles.root}
      src={src}
      alt={alt}
      width={80}
      height={80}
      loading="lazy"
      onError={() => {
        if (fallbackUrl !== undefined && src !== fallbackUrl) {
          setState({ forUrl: url, src: fallbackUrl, errored: false });
        } else {
          setState({ forUrl: url, src, errored: true });
        }
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
