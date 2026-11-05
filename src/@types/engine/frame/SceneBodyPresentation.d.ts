import type { PositionedSceneBody } from './PositionedSceneBody';

/** The one split of the frame's scene bodies by apparent size, each against its own
 * `resolvePx`: disjoint and covering, input order kept per branch. */
export type SceneBodyPresentation = {
  /** Apparent diameter below the body's `resolvePx`: a point or glint. */
  readonly unresolved: readonly PositionedSceneBody[];
  /** At or above it: a sphere or mesh. */
  readonly resolved: readonly PositionedSceneBody[];
};
