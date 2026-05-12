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
};
