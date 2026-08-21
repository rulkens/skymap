/**
 * One world-anchored debug line segment, drawn by `debugLineRenderer` as a
 * screen-aligned thick quad.
 *
 * Deliberately leaner than `MarkerLine` (no `id` or `fadeAlpha`): debug
 * geometry is rebuilt and uploaded wholesale each frame by its own pass, so
 * it carries none of the label director's reconcile / declutter / fade
 * machinery — just the geometry and a premultiplied colour.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';

export type DebugLine = {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Full pixel width of the rendered thick line. */
  readonly width: number;
  /** Premultiplied RGBA. */
  readonly color: Vec4;
};
