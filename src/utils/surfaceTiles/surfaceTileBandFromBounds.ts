import type { LonLatBounds } from '../../@types/scene/LonLatBounds';
import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';

/**
 * surfaceTileBandFromBounds — manifest geography into the walk's uv frame, in
 * the one place the bake and the runtime planner both read, so they cannot
 * disagree about which tiles a band holds. `v` is SOUTH-first (the mesh's v),
 * not the tile grid's north-first rows.
 */
export function surfaceTileBandFromBounds(
  bounds: LonLatBounds,
  min: number,
  max: number,
): SurfaceTileBand {
  return {
    uBounds: [(bounds.west + 180) / 360, (bounds.east + 180) / 360],
    vBounds: [(bounds.south + 90) / 180, (bounds.north + 90) / 180],
    min,
    max,
  };
}
