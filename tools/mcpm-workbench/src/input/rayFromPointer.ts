import type { AppState } from '../../@types/AppState';
import type { Ray } from '../../@types/Ray';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { deriveGridBox } from '../field/deriveGridBox';
import { cameraBasis } from '../render/cameraBasis';
import { cameraViewFor } from '../render/cameraViewFor';
import { screenToRay } from '../gizmo/screenToRay';

// Identity copy of box.rotation, not [0,0,0,1] inline — cameraBasis(box) now rotates by
// R⁻¹ (F2.3) whenever box.rotation isn't identity, but this call site still needs the
// *unrotated* basis per spec §5: handle geometry and drag math are world-space, never
// voxel-space (F2.3 review MAJOR — a rotated box otherwise mis-picks every handle).
const IDENTITY_ROTATION: Vec4 = [0, 0, 0, 1];

/** World-space pick ray through the pointer, against the *unrotated* CameraBasis —
 *  screenToRay's own contract: the gizmo picks world-space handle geometry, never
 *  voxel space. */
export function rayFromPointer(canvas: HTMLCanvasElement, e: PointerEvent, s: AppState): Ray {
  const rect = canvas.getBoundingClientRect();
  const ndc: [number, number] = [
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -(((e.clientY - rect.top) / rect.height) * 2 - 1),
  ];
  const cam = cameraViewFor(s, [canvas.width, canvas.height]);
  const basis = cameraBasis(cam.eyeMpc, cam.targetMpc, cam.upMpc, {
    ...deriveGridBox(s.grid),
    rotation: IDENTITY_ROTATION,
  });
  const aspect = cam.viewportPx[0] / cam.viewportPx[1];
  return screenToRay(cam.eyeMpc, basis, cam.fovYRad, aspect, ndc);
}
