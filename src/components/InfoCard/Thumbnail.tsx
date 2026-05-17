/**
 * Thumbnail — 80×80 px SDSS image cutout with a broken-image fallback.
 *
 * Shown in the top-left of the FullCard alongside the cosmology summary.
 * Loads lazily (only when the card is visible) and swaps to a placeholder div
 * when the image fails to load, so the surrounding layout never reflows.
 *
 * This component is intentionally narrow in scope: it owns only the
 * local `errored` state that tracks image-load failure.  All other data
 * (the URL) is derived upstream in `buildGalaxyInfo` inside the engine.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Thumbnail.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props for the Thumbnail sub-component. */
export type ThumbnailProps = {
  ra: number;
  dec: number;
  url: string;
};

// ── Thumbnail ──────────────────────────────────────────────────────────────────

/**
 * 80×80 px SDSS image cutout with a broken-image fallback.
 *
 * We use `loading="lazy"` so the browser fetches the JPEG only when the card
 * is actually in the viewport — prevents wasted bandwidth on points that are
 * hovered only briefly.  We do NOT pre-fetch: the URL is built lazily each
 * time `buildGalaxyInfo` runs, and the browser's HTTP cache handles repeat
 * hovers over the same point for free.
 *
 * On error (network failure, coord outside SDSS footprint, etc.) we hide the
 * image and show a `.thumb-placeholder` div with the same 80×80 dimensions so
 * the surrounding layout doesn't reflow.
 */
export function Thumbnail({ url }: ThumbnailProps): ReactNode {
  // Single boolean: has the image failed to load?
  // We keep this local state here rather than lifting it to FullCard because
  // the fallback is purely a presentation concern — nothing else needs to know.
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
      // On any load failure (404, CORS, network) flip `errored` so we swap to
      // the placeholder.  This prevents a broken-image icon from appearing.
      onError={() => setErrored(true)}
    />
  );
}
