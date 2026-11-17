import type { Vec2 } from '../math/Vec2';

/**
 * One label's screen-space anchor (lifted, for a `lift`ed label), resolved ONCE per frame by `projectLabels`
 * and shared by every consumer that needs a label's screen position — the
 * COSMO/NEAR0 declutter arms (`label2DDirector`) and the pick-quad emitter
 * (`labelPickQuads`) — so a label can't decide screen position one way for
 * decluttering and another for clicking. `screenPx` is set whenever
 * `clipW > 0` regardless of `onScreen`, matching what the vertex shader would
 * draw for an off-NDC-range anchor.
 */
export type Label2DProjected = {
  readonly screenPx: Vec2 | null;
  readonly clipW: number;
  readonly onScreen: boolean;
  /** A lifted label's subject's apparent diameter, px; 0 when unlifted. */
  readonly subjectSizePx: number;
};
