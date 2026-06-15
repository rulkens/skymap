/**
 * One world-anchored line segment drawn as a screen-aligned thick quad.
 *
 * `id` is a caller-assigned string key — it's not used internally (the
 * renderer only counts and packs instances), but keeping it on the type
 * makes it easy for callers to reconcile the set with their own model
 * without maintaining a parallel index array.
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
  /**
   * Id of the `Label` this line anchors, when the line is an anchor for a
   * label (the lifted famous-galaxy connector, the you-are-here stem). The
   * `labelDirector`'s cross-producer declutter drops a line whose owning
   * label loses an overlap, so the anchor never outlives its text. Lines with
   * no owner (none today) survive declutter unconditionally.
   */
  ownerLabelId?: string;
};
