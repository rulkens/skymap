import type { DeadHostSet } from '../network/DeadHostSet';

export type FetchGalaxyBitmapInput = {
  ra: number;
  dec: number;
  /** Optional AbortSignal to cancel an in-flight fetch. */
  signal?: AbortSignal;
  /**
   * When set, load `/images/famous/<famousId>.webp` directly and skip the
   * SDSS → DSS chain entirely.  Curated WebPs live in `public/images/famous/`
   * and are committed to the repo, so a missing file is a build error, not a
   * runtime fallback situation — there is no DSS fallback for famous galaxies.
   */
  famousId?: string;
  /**
   * Requires `famousId`. Fetches the hi-res WebP from
   * `dataUrl('images/famous-hires/<famousId>.webp')` instead of the
   * curated 128 px atlas tile at `/images/famous/<famousId>.webp`. The
   * result is resized to `hiResTargetDim` square via `createImageBitmap`
   * so it drops straight into the hi-res texture-array slot. Returns
   * `null` when the hi-res file is missing (only ~52 of the 75 famous
   * galaxies have a `full.webp` source); callers fall back to the atlas
   * tile.
   *
   * Gated on `famousId` because only the famous catalog has curated
   * high-resolution source images; SDSS / 2MRS / GLADE on-demand
   * thumbnails are already the best available resolution.
   */
  fetchHiRes?: boolean;
  /**
   * Edge length in pixels for the hi-res bitmap when `fetchHiRes` is
   * true. Callers pass the hi-res texture-array `layerSide` so the
   * decoded bitmap matches the destination slot exactly and no second
   * resize is needed before `copyExternalImageToTexture`. Ignored when
   * `fetchHiRes` is unset.
   */
  hiResTargetDim?: number;
  /**
   * Session memory of hosts that stopped answering, consulted for the SDSS and
   * DSS legs only — the famous/hi-res legs are our own origin, where a missing
   * file is expected rather than an outage, so retiring it would kill every
   * curated thumbnail for the session.
   *
   * Absent ⇒ every host is attempted, which is the pre-existing behaviour and
   * what the tests that don't care about host health get.
   */
  deadHosts?: DeadHostSet;
};
