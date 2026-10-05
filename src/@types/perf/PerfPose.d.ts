/**
 * PerfPose — the exact camera vantage the perf harness hard-cuts to before it
 * starts sampling GPU timings.
 *
 * `framed` is the committed camera arm itself, whichever rung it names, so a
 * body- or site-parented vantage measures its own frame rather than a world
 * re-spelling of its coordinates.
 */

import type { FramedCameraPose } from '../camera/FramedCameraPose';

export type PerfPose = {
  readonly framed: FramedCameraPose;
  /**
   * Yaw drift while sampling; omitted → the installer's PERF_AUTO_ROTATE_RATE.
   * World arm only — the auto-rotate driver is inert on the body and site arms.
   */
  readonly rate?: number;
  /**
   * Clear the body focus before committing the pose. The boot flow focuses
   * Earth, and the focus outranks the pose on both arms: a world pose has its
   * `target` pivot-pinned to the live focused body each frame, and a body arm
   * whose focus sits outside its own subtree is released by its rung. Either
   * way a non-Earth vantage only holds if the focus is cleared first. Opt-in
   * per scenario: clearing unconditionally would change what the historical
   * Earth-target scenarios measure (selection ring, follow framing).
   */
  readonly clearFocus?: boolean;
};
