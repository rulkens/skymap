/**
 * cameraSlice — the camera's Intent state as one RTK slice.
 *
 * `base` carries the committed resting pose AND the arm it lives in: the arm tag
 * IS the regime, so nothing stores a separate flag. The per-frame pose is DERIVED
 * from `base` by the CameraDriver table (`runCameraDrivers`) — never written
 * directly by renderers. The `tween`, `clip` and `frameTween` descriptors are
 * wall-clock-free, so they stay valid across serialisation and replay.
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

// `base` is a placeholder bootstrap overwrites via `commitCameraPose`; 0.43 Mpc
// mirrors `cameraFraming.INITIAL_DISTANCE_MPC` so a pre-bootstrap frame is in the
// right ballpark.
const initialState: CameraState = {
  base: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 }),
  tween: null,
  autoRotate: {
    active: DEFAULT_AUTO_ROTATE,
    // Per-frame yaw advance in radians at an assumed 60 fps (~0.05°/frame), the
    // unit `spinAutoRotate` expects.
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
    beginDrag: (camera) => {
      camera.dragging = true;
    },
    endDrag: (camera) => {
      camera.dragging = false;
    },

    // INVARIANT (R12b-3): every committed ABSOLUTE pose is centre-looking. The
    // pivot pin re-reads an absolute `target` as the pivot and re-derives the eye
    // from yaw/pitch/distance one frame later, so a pose aimed anywhere else
    // teleports the eye by d·2sin(τ/2) (R12-1, up to ~24,000 km). Held by
    // CONSTRUCTION at three sites — the pin's stamp (runFrame step 4), the gesture
    // folds (replayInput), and the fold's disengage retarget — never by a bake
    // here. Break any of them and the teleport re-enters through this reducer.
    commitCameraPose: (camera, action: PayloadAction<FramedCameraPose>) => {
      camera.base = action.payload;
    },

    startCameraTween: (camera, action: PayloadAction<CameraTweenDescriptor>) => {
      camera.tween = action.payload;
    },
    cancelCameraTween: (camera) => {
      camera.tween = null;
    },

    // A FRESH `{ data, frame }` wrapper each time: the clip clock detects a new
    // clip by reference inequality, not deep descriptor equality. `data` must
    // already be resolved (no `start: 'live'` sentinel) — `resolveClipStart` runs
    // at the dispatch site. `frame` is the orientation frame live at dispatch time;
    // the driver holds the clip against THIS frame for its whole run.
    clipStarted: (camera, action: PayloadAction<{ data: ClipData; frame: OrientationFrameId }>) => {
      camera.clip = action.payload;
    },
    // Clears BOTH `clip` and `tween`: a tween planted before or during the clip is
    // dormant while the clip@95 driver wins, but once the clip deactivates an
    // un-cleared @60 tween outranks `resting`@0 and snaps to a stale target.
    clipEnded: (camera) => {
      camera.clip = null;
      camera.tween = null;
    },

    // Orthogonal to `setOrientation`: that snaps the committed target frame, this
    // starts the up-basis slerp toward it — so a URL boot or a tour cue can set the
    // frame without an animation.
    startFrameTween: (camera, action: PayloadAction<FrameTween>) => {
      camera.frameTween = action.payload;
    },
    clearFrameTween: (camera) => {
      camera.frameTween = null;
    },

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

// Resolution happens at the dispatch site, not in the reducer, which is pure and
// has no access to the live pose — so the store only ever receives concrete,
// serialisable values.
export function resolveClipStart(data: ClipData, live: CameraPose): ClipData {
  const start = data.start === 'live' || data.start === undefined ? live : data.start;
  return { ...data, start };
}

export default cameraSlice.reducer;
