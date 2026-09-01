import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { gizmoArrowLengthMpc } from '../gizmo/gizmoArrowLengthMpc';
import { cameraViewFor } from '../render/cameraViewFor';
import type { RootState } from '../store/types';

/** Translate-arrow length for `box`, from the SAME camera formula boxPreviewPass draws
 *  against — pick and draw must agree or grabbing an arrow will miss where it's drawn. */
export function arrowLengthMpcFor(
  canvas: HTMLCanvasElement,
  s: RootState,
  boxCenterMpc: Vec3,
): number {
  const cam = cameraViewFor(s, [canvas.width, canvas.height]);
  return gizmoArrowLengthMpc(cam.eyeMpc, boxCenterMpc, cam.fovYRad);
}
