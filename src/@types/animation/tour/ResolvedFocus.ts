/**
 * ResolvedFocus — the pre-resolved camera target for a tour beat's focus.
 *
 * The resolver seam keeps clip builders pure: rather than having `flyToClip`
 * reach into engine state to look up a SelectionRef's world position, the saga
 * (Task 6) resolves the focus BEFORE calling the builder and passes the result
 * in. The builder becomes a pure function over plain data — no async, no store
 * access, trivially testable.
 *
 * `worldPos` is the world-space centre of the resolved structure in Mpc
 * coordinates. `focusMpc` is the camera orbit-distance appropriate for the
 * structure's scale — the dolly target.
 */

import type { Vec3 } from '../../math/Vec3';

export type ResolvedFocus = {
  readonly worldPos: Vec3;
  readonly focusMpc: number;
};
