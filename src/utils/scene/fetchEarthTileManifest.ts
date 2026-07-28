import type { EarthTileManifest } from '../../@types/scene/EarthTileManifest';
import { dataUrl } from '../../services/loading/fetchWithProgress';

/**
 * fetchEarthTileManifest — read the baked pyramid's description once, when the
 * virtual texture first tries to engage.
 *
 * ## Why every failure is `null` rather than a throw
 *
 * There is nothing for a caller to do about a failure that it is not already
 * doing. No manifest means no known deepest level and no known tile edge, so the
 * planner has nothing to plan and the page table stays all-zero, and an all-zero
 * page table is exactly the picture Earth draws today from its whole-globe base
 * texture. Missing file, 404, HTML error page from a misconfigured bucket,
 * truncated JSON: all four collapse to the same identity case, so distinguishing
 * them at this seam would buy a branch nobody can act on. The one thing a throw
 * WOULD buy — a loud console error — is not worth an exception crossing a
 * per-frame drive site on a device that merely has an older bake deployed.
 *
 * ## Why it goes through `dataUrl`
 *
 * The tile tree lives beside the rest of the streamed data in R2, not in the
 * committed `public/images/` tree, so its URL carries `VITE_DATA_BASE_URL` in
 * production and resolves to Vite's `/data/` in dev. `dataUrl` is the single home
 * for that difference.
 *
 * Not cached here: the caller fetches once per session and holds the result. A
 * module-level promise cache would make the function's behaviour depend on
 * whether some earlier code path happened to call it, which is exactly the kind
 * of hidden coupling a one-shot fetcher should not introduce.
 */
export async function fetchEarthTileManifest(): Promise<EarthTileManifest | null> {
  try {
    const res = await fetch(dataUrl('images/earth-tiles/manifest.json'));
    if (!res.ok) return null;
    return (await res.json()) as EarthTileManifest;
  } catch {
    return null;
  }
}
