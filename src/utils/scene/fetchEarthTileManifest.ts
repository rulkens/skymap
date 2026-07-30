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
    return (await res.json()) as EarthTileManifest;
  } catch {
    return null;
  }
}
