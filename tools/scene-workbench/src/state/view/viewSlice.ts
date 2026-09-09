import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export type SceneCamera = { yaw: number; pitch: number; distanceM: number; targetM: Vec3 };

/** ViewSlice — camera pose, per-asset visibility overrides, and the
 *  device-lost flag. Visibility is an exclusion list (`hiddenAssetIds`), not
 *  a `Record<string, boolean>`: an asset appears in the manifest before any
 *  toggle has touched it, and "absent means visible" needs no initialization
 *  step on every manifest load. */
export type ViewSlice = {
  camera: SceneCamera;
  hiddenAssetIds: readonly string[];
  deviceLost: boolean;
  /** Per-render-layer display knobs. `pointSizePx` is device pixels (quad edge). */
  display: { pointCloud: { pointSizePx: number } };
};

/** Pitch ceiling matching `applyInputToCamera.ts`'s: at exactly ±π/2 forward
 *  is collinear with up and `lookAt` degenerates to an all-NaN view matrix. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

export const defaultViewSlice: ViewSlice = {
  camera: { yaw: 0, pitch: 0.35, distanceM: 200, targetM: [0, 0, 0] },
  hiddenAssetIds: [],
  deviceLost: false,
  // 2px: closes the gaps a 5cm cloud leaves at building scale without fattening the ground.
  display: { pointCloud: { pointSizePx: 2 } },
};

export const viewSlice = createSlice({
  name: 'view',
  initialState: defaultViewSlice,
  reducers: {
    // The gesture-boundary commit (drag/zoom end) is the one write site for
    // the whole pose, clamped exactly like per-field setters would be.
    commitCameraPose: (state, action: PayloadAction<SceneCamera>) => {
      state.camera.yaw = action.payload.yaw;
      state.camera.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, action.payload.pitch));
      state.camera.distanceM = action.payload.distanceM;
      state.camera.targetM = action.payload.targetM;
    },
    toggleAssetVisibility: (state, action: PayloadAction<string>) => {
      const hidden = new Set(state.hiddenAssetIds);
      if (hidden.has(action.payload)) hidden.delete(action.payload);
      else hidden.add(action.payload);
      state.hiddenAssetIds = Array.from(hidden);
    },
    /** Device-lost watcher only — never dispatched by the UI. */
    deviceLost: (state) => {
      state.deviceLost = true;
    },
    setPointCloudPointSize: (state, action: PayloadAction<number>) => {
      state.display.pointCloud.pointSizePx = action.payload;
    },
  },
});

export const { commitCameraPose, toggleAssetVisibility, deviceLost, setPointCloudPointSize } =
  viewSlice.actions;
