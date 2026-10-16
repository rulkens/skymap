import type { NavAxis } from './NavAxis';
import type { NavVelocity } from './NavVelocity';

/** NavigatorState — what the OpenSpace navigator carries from one frame to the next. */
export type NavigatorState = {
  readonly velocity: NavVelocity;
  // The axis the pointer still drives; null once the gesture ended (coasting or at rest).
  readonly held: NavAxis | null;
  // Null until the first step, so that step measures no dt and moves nothing.
  readonly lastNowMs: number | null;
};
