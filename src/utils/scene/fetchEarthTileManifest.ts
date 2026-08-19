import type { EarthTileManifest } from '../../@types/scene/EarthTileManifest';
import { dataUrl } from '../../services/loading/fetchWithProgress';

/**
 * fetchEarthTileManifest — read the baked pyramid's description once, when
 * the virtual texture first tries to engage.
 *
 * Every failure is `null`, never a throw: no manifest means the planner has
 * nothing to plan and the page table stays all-zero — the same picture Earth
 * already draws. Missing file, 404, misconfigured-bucket HTML, truncated JSON
 * all collapse to that one case.
 *
 * Goes through `dataUrl` since the tile tree lives in R2, not the committed
 * `public/images/` tree. Not cached here: a module-level promise cache would
 * make behaviour depend on whether some earlier call happened.
 */
export async function fetchEarthTileManifest(): Promise<EarthTileManifest | null> {
  try {
    const res = await fetch(dataUrl('images/earth-tiles/manifest.json'));
    if (!res.ok) return null;
    const parsed = (await res.json()) as EarthTileManifest;
    // A pre-versioning bake has no prefix; taking it on trust would build
    // every tile URL as "undefined/surface/…" and 404-storm. Folding it into
    // the null case degrades to base-only instead.
    if (typeof parsed?.prefix !== 'string' || parsed.prefix === '') return null;
    // A v1 bake's `levels.surface` is a bare `{min, max}` object, not a band
    // array — trusting it would hand `derivePlannerParams` a `.length` read
    // on an object. An absent `surface` key is legitimately valid (staged
    // rollout), so only a present-but-non-array value is rejected.
    if (parsed.levels?.surface !== undefined && !Array.isArray(parsed.levels.surface)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
