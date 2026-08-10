/**
 * SplashError — discriminated union of the two runtime failure modes
 * the splash can surface.  Each kind carries the minimum information
 * needed to render a specific recovery affordance.
 *
 * - `webgpu-init-failed`  → requestAdapter() returned null on a browser
 *                            that has `navigator.gpu`.  Show error +
 *                            reload button.  The synchronous "no
 *                            navigator.gpu at all" case is handled in
 *                            main.tsx before React mounts; it never
 *                            reaches the splash.
 * - `catalog-fetch-failed`   → an essential galaxy catalog fetch failed.
 *                              Show error + reload button.
 * - `data-version-mismatch`  → the served `.bin` predates this build's
 *                              decoder (a stale deploy or un-rebuilt local
 *                              data dir). Show error + reload button; a
 *                              reload alone won't fix it if the server is
 *                              still serving the old asset, but it's the
 *                              only actionable affordance from the splash.
 */
export type SplashError =
  | { kind: 'webgpu-init-failed'; message: string }
  | { kind: 'catalog-fetch-failed'; message: string }
  | { kind: 'data-version-mismatch'; message: string };
