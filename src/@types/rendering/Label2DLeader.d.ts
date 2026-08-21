/**
 * A label's optional anchor line — the visual connector from a lifted
 * caption back down to the dot/subject it names. Folded onto `Label2D`
 * (rather than a sibling array) because every leader is 1:1 owned by its
 * label; the director synthesizes the drawn `MarkerLine` at flush time.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';

export type Label2DLeader = {
  readonly fromWorld: Vec3;
  readonly toWorld: Vec3;
  /** Full pixel width; the shader halves it. */
  readonly pixelWidth: number;
  /** Straight RGBA. The owning label's fadeAlpha × envelope multiplies both. */
  readonly color: Vec4;
};
