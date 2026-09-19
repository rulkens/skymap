/**
 * HostBodyFrame — a body-m row's per-frame host anchor: the full body-state
 * map (to resolve each drawn body's own `BodyState`), the host's own state,
 * and the host-relative camera pose the row's `vp` was built from.
 */

import type { BodyState } from './BodyState';
import type { BodyRelativePose } from '../engine/camera/BodyRelativePose';

export type HostBodyFrame = {
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly hostState: BodyState;
  readonly hostPose: BodyRelativePose;
};
