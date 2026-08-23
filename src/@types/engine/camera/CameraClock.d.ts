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
import type { CameraState } from '../../camera/CameraState';
import type { SelectionRow } from '../SelectionRow';
import type { FrameTween } from '../../camera/FrameTween';
import type { Vec3 } from '../../math/Vec3';

export type CameraClock = {
  tweenStartMs: number | null;
  autoRotateStartMs: number | null;
  lastTweenRef: CameraTweenDescriptor | null;
  lastAutoRotateActive: boolean;
  // The frame-roll clock keys on the `FrameTween` REFERENCE, not its contents.
  // An orientation-frame switch installs a NEW `FrameTween` object, so `!==`
  // against `lastFrameTweenRef` fires the zero exactly once on the switch frame
  // — the same identity-reset pattern `lastTweenRef` uses for camera tweens.
  frameTweenStartMs: number | null;
  lastFrameTweenRef: FrameTween | null;
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
  // The distance the approach eases TOWARD. Two distinct sources feed it, and
  // conflating them is the bug this field un-braids:
  //
  //   - INITIAL APPROACH target = the `bodyFocusDistance` framing distance. On a
  //     fresh focus (ref change), `followElapsed` nulls this alongside `followFrom`
  //     and the first `pose()` re-seeds it to the framing distance, so the camera
  //     flies in and frames the body regardless of where it started.
  //
  //   - STEADY-STATE target = the user's committed `base.distance`. When a drag
  //     interrupts a follow (orbitDrag wins, commits a zoom into `base`) and follow
  //     then re-wins for the SAME focus ref, `pose()` re-captures `base.distance`
  //     here — so a drag-zoom sticks instead of snapping back to the framing
  //     distance every frame. The re-capture edge is 'follow won this frame but was
  //     not the previous winner' (`prevActiveId !== 'followBody'` with the focus ref
  //     unchanged), detected in the driver via the existing `prevActiveId` Resource.
  //
  // Null means 'no target seeded yet' — the fresh-focus signal that routes `pose()`
  // to the framing branch. Non-null with an unchanged focus ref means an approach
  // is (or was) in flight, so a not-follow-previous frame is a drag reactivation.
  followDistanceTarget: number | null;
  // ── follow-body pan (strafe) offset ────────────────────────────────────────
  // A right-drag strafe while following a body cannot move `cam.target` (the
  // pivot-pin overwrites it with the body position every frame). Instead the
  // strafe accumulates here, and the pivot resolves to `bodyPosition + pan` — so
  // the offset rides along with the body's motion (translate-follow keeps
  // tracking the body, just shifted). FRAME-TAGGED by surface-fixed follow's
  // `engaged` bit: world while disengaged, the body-at-engage frame while
  // engaged, so a grabbed ground point does not slide at ω × pan. Never read or
  // written raw — `followPanWorld` / `addFollowPan` own the conversion (spec
  // §4.6). The reset is winner-gated: `followElapsed` zeroes it
  // (alongside the other follow fields) on a focus ROW ref change, but it only
  // runs when followBody wins the frame. So an offset can outlive a focus switch
  // while a higher driver (e.g. autoRotate) holds the win; it clears the next
  // time followBody wins, and the new target starts centred from there.
  followPanOffset: Vec3;
  // The `cam.target` recorded on the previous follow-drag frame, so the strafe is
  // folded in as the frame-to-frame DELTA of `cam.target` (which, during a drag,
  // is pure pan — orbit changes yaw/pitch, and the body's own motion never
  // touches `cam.target`). Null when no follow-drag is in progress, so each grab
  // starts a fresh delta chain rather than re-basing the offset.
  lastPanTarget: Vec3 | null;
  // The `base` reference auto-rotate last spun from. A commit-on-edge installs a
  // NEW base object while auto-rotate stays active; the spin clock resets when
  // this changes so the freshly committed base spins from elapsed 0, not from
  // the stale accumulated time (which would jump the camera on resume).
  lastBaseRef: CameraPose | null;
  // The clip clock keys on the `camera.clip` REFERENCE, not its contents.
  // A `startClip` dispatch installs a NEW `{ data, frame }` object each time,
  // so `!==` fires the zero exactly once on the transition frame — the same
  // identity-reset pattern used by `lastTweenRef` for tweens.
  clipStartMs: number | null;
  lastClipRef: CameraState['clip'];
};
