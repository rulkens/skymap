import type { NavVelocity } from './NavVelocity';

/** NavigatorState — what the OpenSpace navigator carries from one frame to the next. */
export type NavigatorState = {
  readonly velocity: NavVelocity;
  // Null until the first step, so that step measures no dt and moves nothing.
  readonly lastNowMs: number | null;
};
