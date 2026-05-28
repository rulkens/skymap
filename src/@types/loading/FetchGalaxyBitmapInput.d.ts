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
   * When true (requires `famousId` to be set), fetch the hi-res WebP from
   * `dataUrl('images/famous-hires/<famousId>.webp')` instead of the curated
   * 128 px atlas tile at `/images/famous/<famousId>.webp`. The result is
   * resized to `hiResTargetDim` × `hiResTargetDim` via `createImageBitmap`
   * (callers pass `layerSide` so the bitmap drops straight into the hi-res
   * texture-array slot). Returns `null` when the hi-res file is missing —
   * roughly 23 of the 75 famous galaxies have no `full.webp` source, and
   * the caller falls back to the atlas tile in that case.
   *
   * Gated on `famousId` because only the famous catalog has curated
   * high-resolution source images; SDSS / 2MRS / GLADE rows reach the hi-res
   * code path through a different mechanism (their on-demand thumbnails are
   * already the highest resolution we have for them).
   *
   * Optional — existing callers that don't set this still get the legacy
   * atlas-tile fetch behaviour.
   */
  fetchHiRes?: boolean;
  /**
   * Target edge length in pixels for the hi-res bitmap returned when
   * `fetchHiRes` is true. Callers pass the hi-res texture-array `layerSide`
   * so the decoded bitmap matches the destination slot exactly and no
   * second resize is needed before `copyExternalImageToTexture`. Ignored
   * when `fetchHiRes` is false / unset.
   */
  hiResTargetDim?: number;
};
