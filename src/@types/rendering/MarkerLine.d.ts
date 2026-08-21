/**
 * One world-anchored line segment drawn as a screen-aligned thick quad.
 *
 * `id` is a caller-assigned string key — it's not used internally (the
 * renderer only counts and packs instances), but keeping it on the type
 * makes it easy for callers to reconcile the set with their own model
 * without maintaining a parallel index array.
 *
 * The `label2DDirector` synthesizes one of these per label carrying a
 * `Label2DLeader` at flush time — nothing upstream constructs a `MarkerLine`
 * for a label anchor directly.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';

export type MarkerLine = {
  id: string;
  fromWorld: Vec3;
  toWorld: Vec3;
  /** Full pixel width of the rendered line (the shader halves to half-width). */
  pixelWidth: number;
  /** Premultiplied RGBA — alpha-weighted colour packed into a single vec4. */
  color: Vec4;
  /** Fade multiplier in [0,1] driven by milkyWayLabelVisibility. Defaults to 1. */
  fadeAlpha?: number;
};
