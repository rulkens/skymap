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
 *
 * `sourceOpacity` carries the source's live survey-fade opacity (`fades.opacityOf`
 * sampled at the frame's `nowMs`) so both LOD bodies fold visibility into their
 * emitted alpha/brightness the same way the point-sprite pass does — a hidden
 * catalog's disks now fade out instead of popping once the mask bit clears.
 * Each body reads it once per source in its `beginSource` (not per row: the
 * per-row loop scales with ~2.5M rows).
 */

import type { GalaxyCatalog } from '../../data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { SourceType } from '../../data/SourceType';

export type DiskWalkInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly sourceOpacity: (source: SourceType) => number;
};
