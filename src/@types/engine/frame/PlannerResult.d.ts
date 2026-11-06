/**
 * PlannerResult — what a planner returns: the planned `value` a pass reads
 * back, plus three scheduler votes. `awake`: keep the render loop ticking next
 * frame, something is animating. `settling`: content a sky capture draws is
 * still converging (thumbnails fading in), so cached captures of it are stale.
 * `loading`: content the view asked for has not all arrived yet, which the
 * cold-load gate (`isSceneSettled`) waits on. Two votes because a surface tile
 * in flight is loading but stales no capture, and voting it `settling` re-baked
 * six sky faces every frame. The store's fold enforces settling ⇒ loading ⇒ awake.
 */

export type PlannerResult<T> = {
  readonly value: T;
  readonly awake: boolean;
  readonly settling: boolean;
  readonly loading: boolean;
};
