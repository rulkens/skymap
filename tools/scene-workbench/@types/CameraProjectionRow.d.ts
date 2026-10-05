import type { SceneCameraView } from '../src/render/sceneCameraView';
import type { SceneCamera } from '../src/state/view/viewSlice';
import type { CameraProjection } from './CameraProjection';

export type CameraProjectionRow<P extends CameraProjection> = {
  /** Resolves the pose into what a frame draws; `projection` in the result is of this row's kind. */
  view(camera: SceneCamera, viewportPx: readonly [number, number]): SceneCameraView;
  /** wgpu-matrix convention: destination last, depth mapped to [0, 1]. */
  matrix(projection: P, aspect: number, dst: Float32Array): Float32Array;
  /** Metres per pixel per unit of clip `w` — the shader multiplies by `w`. */
  metresPerPx(projection: P, viewportHeightPx: number): number;
};
