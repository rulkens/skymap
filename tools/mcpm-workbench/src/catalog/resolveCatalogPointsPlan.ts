import type { CatalogPointsPlan } from '../../@types/catalog/CatalogPointsPlan';
import type { CatalogSlice } from '../../@types/catalog/CatalogSlice';

/**
 * `?probe` (probeGpuErrors.ts) swaps in a deterministic in-tool catalog so the
 * GPU probe never touches the network or `public/data`; otherwise the switched-on
 * built-ins, plus the loaded file's points when it is on.
 */
export function resolveCatalogPointsPlan(
  catalog: Pick<CatalogSlice, 'userCatalog' | 'userCatalogOn' | 'sources' | 'tier'>,
  probeGate: boolean,
): CatalogPointsPlan {
  if (probeGate) return { kind: 'synthetic' };
  const userCatalog = catalog.userCatalogOn ? catalog.userCatalog : null;
  return { kind: 'load', sources: catalog.sources, tier: catalog.tier, userCatalog };
}
