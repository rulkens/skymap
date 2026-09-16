import type { SurfaceTileManifest } from '../../@types/scene/SurfaceTileManifest';
import { dataUrl } from '../../services/loading/fetchWithProgress';

/**
 * fetchSurfaceTileManifest — read the baked pyramid's description once, when
 * the virtual texture first tries to engage. `manifestKey` is the engaged
 * body's `SURFACE_TILE_REGISTRY` entry (e.g. `earth-tiles`) — never a
 * literal, so a second body's manifest lives at its own path for free.
 *
 * Every failure is `null`, never a throw: no manifest means the planner has
 * nothing to plan and the page table stays all-zero — the same picture the
 * body already draws. Missing file, 404, misconfigured-bucket HTML,
 * truncated JSON all collapse to that one case.
 *
 * Goes through `dataUrl` since the tile tree lives in R2, not the committed
 * `public/images/` tree. Not cached here: a module-level promise cache would
 * make behaviour depend on whether some earlier call happened.
 */
export async function fetchSurfaceTileManifest(
  manifestKey: string,
): Promise<SurfaceTileManifest | null> {
  try {
    // Revalidate every load: a cached copy held past a prefix bump names a
    // version the bucket no longer has.
    const res = await fetch(dataUrl(`images/${manifestKey}/manifest.json`), { cache: 'no-cache' });
    if (!res.ok) return null;
    const parsed = (await res.json()) as SurfaceTileManifest;
    // A pre-versioning bake has no prefix; taking it on trust would build
    // every tile URL as "undefined/surface/…" and 404-storm. Folding it into
    // the null case degrades to base-only instead.
    if (typeof parsed?.prefix !== 'string' || parsed.prefix === '') return null;
    // A pre-v8 bake keys tiles by `levels` (per-kind), not this format's flat
    // `bands` list — trusting one would hand `derivePlannerParams` a
    // `.length` read on `undefined`. Rejecting a missing/non-array `bands`
    // catches that shape for free (a `levels`-keyed manifest simply has no
    // `bands` field), degrading to null exactly like a missing manifest.
    if (
      !Array.isArray(parsed.bands) ||
      parsed.bands.some((band) => typeof band?.min !== 'number' || typeof band?.max !== 'number')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
