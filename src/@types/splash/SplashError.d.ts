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
 * - `catalog-fetch-failed` → an essential galaxy catalog fetch failed.
 *                            Show error + reload button.
 */
export type SplashError =
  | { kind: 'webgpu-init-failed'; message: string }
  | { kind: 'catalog-fetch-failed'; message: string };
