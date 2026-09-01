import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { WorkbenchCameraPose } from '../../@types/WorkbenchCameraPose';
import { gizmoArrowLengthMpc } from '../gizmo/gizmoArrowLengthMpc';
import { cameraViewFor } from '../render/cameraViewFor';

/** Translate-arrow length for `box`, from the SAME camera formula boxPreviewPass draws
 *  against — pick and draw must agree or grabbing an arrow will miss where it's drawn. */
export function arrowLengthMpcFor(
  canvas: HTMLCanvasElement,
  camera: WorkbenchCameraPose,
  boxCenterMpc: Vec3,
): number {
  const cam = cameraViewFor(camera, [canvas.width, canvas.height]);
  return gizmoArrowLengthMpc(cam.eyeMpc, boxCenterMpc, cam.fovYRad);
}
