import type { mat4 } from 'gl-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { PointCloud } from '../../data/PointCloud';
import type { Source } from '../../../data/sources';
import type { Vec3 } from '../../math/Vec3';
import type { ThumbnailRenderer } from '../../rendering/ThumbnailRenderer';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';

/**
 * Per-frame inputs.  Everything the inner loop reads from the engine's
 * closure today is forwarded here as an explicit parameter — no hidden
 * coupling.  The subsystem reads (not writes) every field.
 */
export type ThumbnailFrameInput = {
  /** Active orbit camera.  Apparent-size and visibility cull both rely on it. */
  cam: OrbitCamera;
  /** All loaded clouds keyed by Source enum.  Hidden surveys are filtered inside. */
  clouds: Map<Source, PointCloud>;
  /** Bitmask of currently-visible sources (1 bit per Source enum value). */
  visibleSourceMask: number;
  /** Canvas backing-store size in CSS pixels — feeds the pinhole pxPerRad. */
  canvasSize: { width: number; height: number };
  /** Render-pass encoder — thumbnailRenderer + texturedDiskRenderer encode their draws here. */
  pass: GPURenderPassEncoder;
  /** Combined view+projection matrix for the current camera. */
  viewProj: mat4;
  /** pre-computed `canvas.height / (2 · tan(fovY/2))` to share with engine. */
  pxPerRad: number;
  /** Camera world-position snapshot for the back-to-front sort comparator. */
  camPos: Readonly<Vec3>;
  /** ThumbnailRenderer instance — engine owns it; subsystem just calls draw(). */
  thumbnailRenderer: ThumbnailRenderer;
  /** TexturedDiskRenderer instance — same ownership story as thumbnailRenderer. */
  texturedDiskRenderer: TexturedDiskRenderer;
  /** Famous-meta sidecar, used to route Famous-source rows to curated WebPs. */
  famousMeta: FamousMetaEntry[];
  /** Famous-xrefs sidecar — currently unused inside the subsystem but kept
   * as a hook so future cross-survey badge logic can read it without
   * widening the function signature. */
  famousXrefs: FamousXrefMap;
};
