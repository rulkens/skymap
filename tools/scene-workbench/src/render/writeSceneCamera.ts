/**
 * The per-frame uniform lidarPoint.wesl's `SceneCamera` reads — 112 bytes, the
 * layout that shader mirrors field for field (pinned by `sceneCamera.parity.test.ts`).
 *
 * `rightM`/`upM` come from `sceneCameraView`, the SAME basis pan drags along, so a
 * dragged point stays under the cursor. `metresPerPx` is metres per pixel per metre
 * of depth — the shader multiplies it by the clip `w`.
 */
import { mat4 } from 'wgpu-matrix';

import type { SceneCameraView } from './sceneCameraView';

/** Near/far in metres: hand-scale detail up to the ~2.5 km scene diagonal. */
const NEAR_M = 0.5;
const FAR_M = 5000;

export const SCENE_CAMERA_BYTES = 112;

const viewScratch = new Float32Array(16);
const projScratch = new Float32Array(16);
const viewProjScratch = new Float32Array(16);

/** Fill `out` (>= 28 floats) with the `SceneCamera` for `view`. */
export function writeSceneCamera(
  out: Float32Array,
  view: SceneCameraView,
  pointSizePx: number,
): void {
  const [width, height] = view.viewportPx;
  // wgpu-matrix takes the destination LAST and returns it; `perspective` maps
  // depth to [0, 1], WebGPU's range.
  const proj = mat4.perspective(view.fovYRad, width / height, NEAR_M, FAR_M, projScratch);
  const look = mat4.lookAt(view.eyeM, view.targetM, view.upM, viewScratch);
  const viewProj = mat4.multiply(proj, look, viewProjScratch);

  out.set(viewProj, 0);
  out.set(view.rightM, 16);
  out[19] = pointSizePx;
  out.set(view.upM, 20);
  out[23] = height;
  out.set(view.eyeM, 24);
  out[27] = (2 * Math.tan(view.fovYRad * 0.5)) / height;
}
