/**
 * PlannerResult — what a planner returns: the planned `value` a pass reads
 * back, plus two scheduler votes. `awake`: keep the render loop ticking next
 * frame, something is animating. `settling`: the planned content is still
 * converging (thumbnails fading in), so cached sky captures of it are stale.
 * `settling` implies `awake`; the store's fold enforces it.
 */

export type PlannerResult<T> = {
  readonly value: T;
  readonly awake: boolean;
  readonly settling: boolean;
};
