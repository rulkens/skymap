/**
 * cameraSlice — the camera's full Intent state as a single Redux Toolkit slice,
 * authored with inline Immer case reducers.
 *
 * Camera Intent belongs in the store because everything that needs to read or
 * write camera position (orbit controls, tour storyboard, auto-rotate, sagas)
 * should share a single authoritative source rather than coordinating via
 * callbacks or ref-passing. The slice owns three independent concerns:
 *
 *   `base`        — the committed resting pose AND the frame it lives in (a
 *                   `FramedCameraPose`): the arm tag IS the regime, so nothing
 *                   stores a separate flag. Per-frame pose is DERIVED from `base` by the
 *                   CameraDriver table (`runCameraDrivers`) — never written directly by renderers.
 *                   Bootstrap dispatches `commitCameraPose` once to overwrite
 *                   the placeholder initial value with the real computed pose.
 *
 *   `tween`       — an optional timeless from→to descriptor. Null when the
 *                   camera is at rest. The animation clock lives in the engine
 *                   as a Resource, not here — the descriptor is wall-clock-free
 *                   so it remains valid across serialisation and replay.
 *
 *   `autoRotate`  — the active flag plus the per-frame yaw-delta rate. Both
 *                   live here as the single home for auto-rotate config; the
 *                   `spinAutoRotate` pure function reads the rate from the slice
 *                   rather than from a scattered engine constant.
 *
 *   `dragging`    — transient gesture flag set by orbit-controls on
 *                   pointerdown/pointerup. Suppresses auto-rotate while the
 *                   user holds a drag.
 *
 * Inline Immer gives structural sharing for free: mutating `camera.base`
 * produces a new `base` reference (selectors over it re-run) while `tween`,
 * `autoRotate`, and `dragging` keep their prior references (their selectors
 * skip) — the same guarantee the old copy-on-write spreads hand-maintained,
 * with none of the nesting overhead.
 *
 *   `clip`        — an optional in-flight animation clip descriptor. Null when
 *                   no clip is active. The clip@95 driver owns the camera during
 *                   playback; `clip.data` is the serializable authored form. A
 *                   FRESH `{ data }` wrapper is stored on each `clipStarted` — the
 *                   Task 8 clock keys on this reference identity to detect a new
 *                   clip (same pattern as `tween` reference equality in tweenSaga).
 *
 *   `frameTween`  — an optional in-flight orientation-frame roll descriptor.
 *                   Null when no frame roll is in flight. The up-basis is
 *                   DERIVED per frame by a resolver while the slerp runs; the
 *                   descriptor is wall-clock-free so it stays valid across
 *                   serialisation and replay, like `tween`.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_AUTO_ROTATE } from '../../data/defaults';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import type { CameraState } from '../../@types/camera/CameraState';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { CameraTweenDescriptor } from '../../@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../@types/animation/ClipData';
import type { FrameTween } from '../../@types/camera/FrameTween';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';

// `base` is a placeholder; bootstrap overwrites via `commitCameraPose` once
// `computeInitialCamera` has run. 0.43 mirrors `cameraFraming.INITIAL_DISTANCE_MPC`,
// the value the engine boots with, so any frame rendered before bootstrap is
// at least in the right ballpark.
const initialState: CameraState = {
  base: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 }),
  tween: null,
  autoRotate: {
    active: DEFAULT_AUTO_ROTATE,
    // rate = per-frame yaw advance at an assumed 60 fps (~0.05°/frame), the
    // unit `spinAutoRotate` expects. The slice is its single home; do not
    // import from the engine — that would couple state→engine the wrong way.
    rate: 0.000873,
  },
  dragging: false,
  clip: null,
  frameTween: null,
};

const cameraSlice = createSlice({
  name: 'camera',
  initialState,
  reducers: {
    // ── gesture state ───────────────────────────────────────────────────────
    beginDrag: (camera) => {
      camera.dragging = true;
    },
    endDrag: (camera) => {
      camera.dragging = false;
    },

    // ── committed resting pose ──────────────────────────────────────────────
    // Called once at bootstrap (after `computeInitialCamera`) and on every
    // orbit-controls pointerup to bake the user's new resting pose.
    //
    // INVARIANT (R12b-3): every committed ABSOLUTE pose is centre-looking —
    // while a moving body is focused, forward passes through the pivot
    // (body + panOffset). The pivot pin re-reads an absolute `target` as the
    // pivot and re-derives the eye from yaw/pitch/distance one frame later,
    // so committing a pose aimed anywhere else teleports the eye by
    // d·2sin(τ/2) (R12-1, up to ~24,000 km). Held by CONSTRUCTION, not by a
    // bake: commits take the authored register (`cameraRuntime.lastPose`),
    // which the render-side tilt projection (`approachTiltedPose` →
    // `displayedPose`) never touches — the pin stamps it centre-looking each
    // frame (runFrame step 4), the gesture folds preserve aim-at-pivot
    // (drainInput), and the fold's disengage retarget rebuilds it
    // (runFrame's regime fold). KNOWN RESIDUAL: the commit-on-edge with a
    // clip/tween prevRow bakes whatever target the descriptor authored — the
    // pre-existing authored-target/pin item (spec §790); the real focus path
    // builds body-centred `to`s. Break any of the three construction sites
    // and this reducer is where the teleport re-enters.
    commitCameraPose: (camera, action: PayloadAction<FramedCameraPose>) => {
      camera.base = action.payload;
    },

    // ── tween lifecycle ─────────────────────────────────────────────────────
    startCameraTween: (camera, action: PayloadAction<CameraTweenDescriptor>) => {
      camera.tween = action.payload;
    },
    cancelCameraTween: (camera) => {
      camera.tween = null;
    },

    // ── clip lifecycle ──────────────────────────────────────────────────────
    // `clipStarted` stores a FRESH `{ data, frame }` wrapper so Task 8's clock
    // saga can detect a new clip by reference inequality (`prev !== next`)
    // without comparing deep descriptor equality. `data` must already be
    // resolved (no `start: 'live'` sentinel) — call `resolveClipStart` at the
    // dispatch site before putting this action, mirroring `focusTweenSaga`'s
    // pattern of baking the tween `from` before `put(startCameraTween)`. `frame`
    // is the orientation frame live at dispatch time — the driver evaluates and
    // holds the clip against THIS frame for its whole run, then re-encodes into
    // the current one each tick (see cameraDrivers.ts's clip row).
    //
    // Past-tense `clipStarted`/`clipEnded` (not `startClip`/`endClip`): these are
    // the low-level lifecycle WRITES. The user-facing request action that names a
    // clip to play is `startClip(id)` in `clipActions.ts` — the saga resolves it
    // and dispatches `clipStarted` here.
    clipStarted: (camera, action: PayloadAction<{ data: ClipData; frame: OrientationFrameId }>) => {
      camera.clip = action.payload;
    },
    // `clipEnded` clears BOTH `clip` and `tween`. A tween planted before or
    // during the clip (e.g. by a focus saga) is dormant while the clip@95
    // driver wins priority, but once the clip deactivates an un-cleared @60
    // tween would outrank `resting`@0 and snap the camera to a stale target.
    // Mirroring `cancelCameraTween`, this is the teardown contract.
    clipEnded: (camera) => {
      camera.clip = null;
      camera.tween = null;
    },

    // ── frame-tween lifecycle ───────────────────────────────────────────────
    // The orientation-frame roll is orthogonal to `setOrientation`: the latter
    // snaps the committed target frame, this starts the up-basis slerp toward
    // it. Keeping them separate lets a URL-boot apply or a tour cue set the
    // frame without an animation they don't want. A resolver derives the basis
    // per frame while `frameTween` is non-null.
    startFrameTween: (camera, action: PayloadAction<FrameTween>) => {
      camera.frameTween = action.payload;
    },
    clearFrameTween: (camera) => {
      camera.frameTween = null;
    },

    // ── auto-rotate ─────────────────────────────────────────────────────────
    // Replaces the whole sub-object so both `active` and `rate` can be
    // updated atomically (e.g. a settings panel that exposes a rate slider).
    setAutoRotate: (camera, action: PayloadAction<{ active: boolean; rate: number }>) => {
      camera.autoRotate = action.payload;
    },
  },
});

export const {
  beginDrag,
  endDrag,
  commitCameraPose,
  startCameraTween,
  cancelCameraTween,
  setAutoRotate,
  clipStarted,
  clipEnded,
  startFrameTween,
  clearFrameTween,
} = cameraSlice.actions;

// ── pure helper (not a reducer) ──────────────────────────────────────────────
// Resolution happens at the dispatch site rather than inside the reducer because
// the reducer is pure and has no access to the live camera pose. This mirrors
// `focusTweenSaga.ts` baking the tween `from` before `put(startCameraTween)` —
// the store only ever receives already-concrete values, which keeps reducers
// testable without engine context and the payload safe to serialise/replay.
export function resolveClipStart(data: ClipData, live: CameraPose): ClipData {
  const start = data.start === 'live' || data.start === undefined ? live : data.start;
  return { ...data, start };
}

export default cameraSlice.reducer;
