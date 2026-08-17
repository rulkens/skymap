/**
 * DiskWalkInput — the geometry-bearing frame input the shared disk-planner
 * walk needs, and the exact subset both the LOD-1 (procedural) and LOD-2
 * (textured) bodies share.
 *
 * ### Why a dedicated shared type
 *
 * The two disk planners each used to own an identical `FrameInput` shape and
 * walk the catalogs independently, computing every row's `camDist` + apparent
 * `px` twice. The unified walk computes that geometry ONCE, which means its
 * input can only carry what the geometry pass itself reads: the camera, the
 * visible catalogs, the source-visibility mask, and the hoisted
 * pixels-per-radian. Body-specific extras (the textured planner's `famousGalaxiesMeta`
 * / `nowMs`) are NOT here — each body intersects this type with its own frame
 * input so the walk never sees fields it doesn't use.
 *
 * `ProceduralDiskFrameInput` aliases this type verbatim (the procedural body
 * needs no extras); the textured body extends it.
 */

import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { SourceType } from '../../data/SourceType';

export type DiskWalkInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
};
