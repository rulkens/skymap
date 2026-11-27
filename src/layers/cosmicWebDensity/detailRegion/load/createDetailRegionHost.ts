/**
 * createDetailRegionHost — at most one detail region per pyramid field (spec §6.4, §6.6). A field
 * that leaves `wanted` or changes K (medium ↔ large) is torn down; small ↔ medium keeps its region,
 * since only the base's gain changes there and the shader applies it, not the region's texels.
 */
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';
import type { DetailRegionFrame } from '../@types/DetailRegionFrame';
import type { DetailRegionHost } from '../@types/DetailRegionHost';
import type { DetailRegionHostDeps } from '../@types/DetailRegionHostDeps';
import type { HostedDetailRegion } from '../@types/HostedDetailRegion';
import { createDetailRegion } from './createDetailRegion';

export function createDetailRegionHost(deps: DetailRegionHostDeps): DetailRegionHost {
  const hosted = new Map<CosmicWebDensityFieldId, HostedDetailRegion>();
  const drop = (id: CosmicWebDensityFieldId) => {
    hosted.get(id)?.region.destroy();
    hosted.delete(id);
  };

  return {
    frame(wanted, eye, gatePxPerRad, frameIndex, nowMs) {
      for (const [id, { k }] of hosted) if (wanted.get(id) !== k) drop(id);
      const draws = Object.fromEntries(
        COSMIC_WEB_DENSITY_SOURCE_ROWS.map((row) => [row.id, null]),
      ) as Record<CosmicWebDensityFieldId, DetailRegionFrame['draws'][CosmicWebDensityFieldId]>;
      let busy = false;
      for (const row of COSMIC_WEB_DENSITY_SOURCE_ROWS) {
        const k = wanted.get(row.id);
        if (k === undefined) continue;
        let entry = hosted.get(row.id);
        if (!entry) {
          const region = createDetailRegion({
            ...deps,
            id: row.id,
            binBaseName: row.binBaseName,
            bricksPerAxis: k,
          });
          entry = { region, k };
          hosted.set(row.id, entry);
        }
        const step = entry.region.frame(eye, gatePxPerRad, frameIndex, nowMs);
        draws[row.id] = step.draw;
        busy ||= step.busy;
      }
      return { draws, busy };
    },
    destroy() {
      for (const id of [...hosted.keys()]) drop(id);
    },
  };
}
