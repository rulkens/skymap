/**
 * CameraClock — the engine Resource that converts 'a descriptor's identity
 * changed' into 'ms elapsed since it started'.
 *
 * The store's `CameraTweenDescriptor` and the `autoRotate` flag are timeless:
 * they say WHAT the camera should do, not WHEN it started. The clock is the
 * transient bridge — it detects reference-identity changes on each frame and
 * resets the relevant start time. This keeps store shapes free of wall-clock
 * coupling while giving drivers an elapsed-ms value they can use for easing.
 *
 * Reference-identity reset (rather than a per-driver 'enter' hook):
 * a new `startCameraTween` dispatch installs a NEW descriptor object;
 * `!==` against `lastTweenRef` fires the zero exactly once, on the frame the
 * new object arrives. No lifecycle hooks, no subscription machinery — the
 * frame-loop pass of `tweenElapsed` is the only wire.
 *
 * Lives in engine transient state, not the Redux store.
 */

import type { CameraTweenDescriptor } from '../../camera/CameraTweenDescriptor';
import type { CameraPose } from '../../camera/CameraPose';

export type CameraClock = {
  tweenStartMs: number | null;
  autoRotateStartMs: number | null;
  lastTweenRef: CameraTweenDescriptor | null;
  lastAutoRotateActive: boolean;
  // The `base` reference auto-rotate last spun from. A commit-on-edge installs a
  // NEW base object while auto-rotate stays active; the spin clock resets when
  // this changes so the freshly committed base spins from elapsed 0, not from
  // the stale accumulated time (which would jump the camera on resume).
  lastBaseRef: CameraPose | null;
};
