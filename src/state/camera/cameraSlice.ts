/**
 * cameraSlice — the camera's full Intent state as a single Redux Toolkit slice,
 * authored with inline Immer case reducers.
 *
 * Camera Intent belongs in the store because everything that needs to read or
 * write camera position (orbit controls, tour storyboard, auto-rotate, sagas)
 * should share a single authoritative source rather than coordinating via
 * callbacks or ref-passing. The slice owns three independent concerns:
 *
 *   `base`        — the committed resting orbit pose (target, yaw, pitch,
 *                   distance). Per-frame pose is DERIVED from `base` by the
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
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_AUTO_ROTATE } from '../../data/defaults';
import type { CameraState } from '../../@types/camera/CameraState';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../@types/camera/CameraTweenDescriptor';

// `base` is a placeholder; bootstrap overwrites via `commitCameraPose` once
// `computeInitialCamera` has run. 0.43 mirrors `cameraFraming.INITIAL_DISTANCE_MPC`,
// the value the engine boots with, so any frame rendered before bootstrap is
// at least in the right ballpark.
const initialState: CameraState = {
  base: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 },
  tween: null,
  autoRotate: {
    active: DEFAULT_AUTO_ROTATE,
    // rate = per-frame yaw advance at an assumed 60 fps (~0.05°/frame), the
    // unit `spinAutoRotate` expects. The slice is its single home; do not
    // import from the engine — that would couple state→engine the wrong way.
    rate: 0.000873,
  },
  dragging: false,
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
    commitCameraPose: (camera, action: PayloadAction<CameraPose>) => {
      camera.base = action.payload;
    },

    // ── tween lifecycle ─────────────────────────────────────────────────────
    startCameraTween: (camera, action: PayloadAction<CameraTweenDescriptor>) => {
      camera.tween = action.payload;
    },
    cancelCameraTween: (camera) => {
      camera.tween = null;
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
} = cameraSlice.actions;

export default cameraSlice.reducer;
