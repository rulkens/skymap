/**
 * Table-build check of every declared demand, run once in `createLayers`. A declaration that
 * names nothing would otherwise throw inside the demand loop's per-row guard every frame,
 * where it only warns and the asset silently never loads.
 */

import { resolveAssetDemand } from './resolveAssetDemand';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

export function assertAssetDemands(
  rows: readonly AssetWiringRow[],
  entries: readonly VisibilityEntry[],
): void {
  for (const row of rows) {
    const demand = row.demand;
    if (typeof demand === 'string' || 'companionOf' in demand) continue;
    try {
      const { selects } = resolveAssetDemand(demand, row.gates, entries);
      const near = demand.near;
      if (near !== undefined && (near.lead < 1 || near.release < near.lead)) {
        throw new Error(
          `near needs release ≥ lead ≥ 1, got lead ${near.lead}, release ${near.release}`,
        );
      }
      const size = demand.size;
      if (size !== undefined && !(size.loadPx > size.releasePx && size.releasePx > 0)) {
        throw new Error(
          `size needs loadPx > releasePx > 0, got ${size.loadPx} and ${size.releasePx}`,
        );
      }
      if (demand.alsoWhen?.includes('selected') && selects === undefined) {
        throw new Error("lifts on 'selected' but its entry has no `selects`");
      }
    } catch (err) {
      throw new Error(`asset row '${String(row.key)}': ${(err as Error).message}`, { cause: err });
    }
  }
}
