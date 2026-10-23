/**
 * SurfaceTilePlan — one frame's surface-tile decisions, `planSurfaceTiles`'
 * result: what the passes draw (`cut`) and what the stream applies (touches
 * first, then `requests`, as `OctreeChunkStream.update` does). Position facts
 * (`subCamera`, `verdict`) come from `SurfaceTileOver`; view facts (`cut`,
 * `lastPlan`) only from views that show the body.
 */

import type { SurfaceCutTile } from '../../scene/SurfaceCutTile';
import type { SurfaceTileRequest } from '../../scene/SurfaceTileRequest';
import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { TerrainSubCamera } from '../../camera/TerrainSubCamera';
import type { SurfaceTileVerdict } from './SurfaceTileVerdict';

export type SurfaceTilePlan = {
  readonly cut: readonly SurfaceCutTile[];
  /** Requested keys holding a slot (landed or in flight), request order: the
   *  stream stamps these before allocating, so no miss evicts one. */
  readonly touched: readonly string[];
  /** Keys with no slot that never failed, largest on screen first. */
  readonly requests: readonly SurfaceTileRequest[];
  readonly wantManifest: (SceneBodyId & SurfaceTileBodyId) | null;
  readonly verdict: SurfaceTileVerdict;
  /** Null unless the engage gate (`zWin > baseLevel`) passed. */
  readonly lastPlan: {
    readonly requestCount: number;
    readonly zWin: number;
    /** Requested tiles with no bitmap landed, either product. */
    readonly misses: number;
  } | null;
  readonly subCamera: TerrainSubCamera | null;
  /** Manifest wanted or pending, or fetches in flight. */
  readonly awake: boolean;
};
