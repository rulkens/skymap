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
import type { ClipData } from '../../animation/ClipData';
import type { SelectionRow } from '../SelectionRow';

export type CameraClock = {
  tweenStartMs: number | null;
  autoRotateStartMs: number | null;
  lastTweenRef: CameraTweenDescriptor | null;
  lastAutoRotateActive: boolean;
  // ── follow-body approach ease ──────────────────────────────────────────────
  // The `followBody` driver eases the camera from wherever it was into a framing
  // pose on the focused body, then translate-follows the body as the sim clock
  // moves it. Like the tween/autoRotate arms, the ease is wall-clock-free in the
  // store — the timer lives here.
  //
  // The follow clock keys on the focus ROW REFERENCE, not the body id: a
  // re-select of the SAME body installs a fresh `selectionRows.focus` object, so
  // `!==` fires the ease-restart exactly once on that transition (the same
  // identity-reset pattern `lastTweenRef` uses). A drag mid-follow leaves the ref
  // untouched, so the ease is NOT restarted on drag-release — the camera resumes
  // its saturated follow rather than snapping back to re-approach.
  followStartMs: number | null;
  lastFollowRef: SelectionRow | null;
  // The on-screen pose captured at the activation edge — the `from` the approach
  // eases OUT of. Captured from the live rendered pose (`lastPose`), not `base`,
  // so switching focus A→B eases from where the camera visibly IS (framing A),
  // never jumping back to the committed resting pose first. Nulled on the edge by
  // `followElapsed`; the first `pose()` after fills it (only the driver can see
  // the live rendered pose, so the capture is split from the timer).
  followFrom: CameraPose | null;
  // The `base` reference auto-rotate last spun from. A commit-on-edge installs a
  // NEW base object while auto-rotate stays active; the spin clock resets when
  // this changes so the freshly committed base spins from elapsed 0, not from
  // the stale accumulated time (which would jump the camera on resume).
  lastBaseRef: CameraPose | null;
  // The clip clock keys on the `camera.clip` REFERENCE, not its contents.
  // A `startClip` dispatch installs a NEW `{ data: ClipData }` object each time,
  // so `!==` fires the zero exactly once on the transition frame — the same
  // identity-reset pattern used by `lastTweenRef` for tweens.
  clipStartMs: number | null;
  lastClipRef: { data: ClipData } | null;
};
