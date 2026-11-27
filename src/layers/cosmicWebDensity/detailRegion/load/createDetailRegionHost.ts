/**
 * createDetailRegionHost — at most one detail region per pyramid field (spec §6.4, §6.6). A field
 * that leaves `wanted` or changes K (medium ↔ large) is torn down; small ↔ medium keeps its region,
 * since the region reads at gain 1 with no tie to the base level.
 */
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';
import type { DetailRegion } from '../@types/DetailRegion';
import type { DetailRegionFrame } from '../@types/DetailRegionFrame';
import type { DetailRegionHost } from '../@types/DetailRegionHost';
import type { DetailRegionHostDeps } from '../@types/DetailRegionHostDeps';
import { createDetailRegion } from './createDetailRegion';

export function createDetailRegionHost(deps: DetailRegionHostDeps): DetailRegionHost {
  const regions = new Map<CosmicWebDensityFieldId, DetailRegion>();
  const bricksPerAxisOf = new Map<CosmicWebDensityFieldId, number>();
  const drop = (id: CosmicWebDensityFieldId) => {
    regions.get(id)?.destroy();
    regions.delete(id);
    bricksPerAxisOf.delete(id);
  };

  return {
    frame(wanted, eye, gatePxPerRad, frameIndex, nowMs) {
      for (const [id, k] of bricksPerAxisOf) if (wanted.get(id) !== k) drop(id);
      const draws = Object.fromEntries(
        COSMIC_WEB_DENSITY_SOURCE_ROWS.map((row) => [row.id, null]),
      ) as Record<CosmicWebDensityFieldId, DetailRegionFrame['draws'][CosmicWebDensityFieldId]>;
      let busy = false;
      for (const row of COSMIC_WEB_DENSITY_SOURCE_ROWS) {
        const k = wanted.get(row.id);
        if (k === undefined) continue;
        let region = regions.get(row.id);
        if (!region) {
          region = createDetailRegion({
            ...deps,
            id: row.id,
            binBaseName: row.binBaseName,
            bricksPerAxis: k,
          });
          regions.set(row.id, region);
          bricksPerAxisOf.set(row.id, k);
        }
        const step = region.frame(eye, gatePxPerRad, frameIndex, nowMs);
        draws[row.id] = step.draw;
        busy ||= step.busy;
      }
      return { draws, busy };
    },
    destroy() {
      for (const id of [...regions.keys()]) drop(id);
    },
  };
}
