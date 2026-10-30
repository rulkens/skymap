/**
 * SurfaceTilePlan — one frame's surface-tile decisions, `planSurfaceTiles`'
 * result: what the passes draw (`cut`) and what the stream applies (touches
 * first, then `requests`, as `OctreeChunkStream.update` does). Position facts
 * (`verdict`) come from `SurfaceTileOver`; view facts (`cut`,
 * `lastPlan`) only from views that show the body.
 */

import type { SurfaceCutTile } from './SurfaceCutTile';
import type { SurfaceTileRequest } from './SurfaceTileRequest';
import type { SurfaceTileId } from '../../../@types/data/SurfaceTileId';
import type { SurfaceTilePlannerParams } from './SurfaceTilePlannerParams';
import type { SurfaceTileBodyId } from '../../../@types/data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { SurfaceTileVerdict } from './SurfaceTileVerdict';

export type SurfaceTilePlan = {
  readonly cut: readonly SurfaceCutTile[];
  /** Requested tiles holding a slot (landed or in flight), request order: the
   *  stream stamps these before allocating, so no miss evicts one. */
  readonly touched: readonly SurfaceTileId[];
  /** Tiles with no slot that never failed, largest on screen first. */
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
  /** The over body's walk params at its COMMITTED tier, null before its
   *  manifest lands: `heightAt` climbs no lower than the last plan's
   *  `baseLevel`, the floor the cut was walked from. */
  readonly params: SurfaceTilePlannerParams | null;
  /** Manifest wanted or pending, requests issued, or fetches in flight. */
  readonly awake: boolean;
};
