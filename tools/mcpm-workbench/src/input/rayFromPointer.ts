import type { GridBox } from '../../@types/GridBox';
import type { Ray } from '../../@types/Ray';
import type { ViewSlice } from '../../@types/ViewSlice';
import { cameraBasis } from '../render/cameraBasis';
import { cameraViewFor } from '../render/cameraViewFor';
import { screenToRay } from '../gizmo/screenToRay';

// cameraBasis only reads `.rotation` off its GridBox param — fabricated zeros elsewhere,
// so this site skips deriveGridBox's bisection + autofit just to overwrite the one field
// it needs. Identity, not the real box.rotation: handle geometry and drag math are
// world-space, never voxel-space (F2.3 review MAJOR — a rotated box otherwise mis-picks
// every handle), so cameraBasis's R⁻¹ (F2.3) must not apply here.
const UNROTATED_BASIS_BOX: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [0, 0, 0],
  dims: [0, 0, 0],
  voxelSizeMpc: 0,
  rotation: [0, 0, 0, 1],
};

/** World-space pick ray through the pointer, against the *unrotated* CameraBasis —
 *  screenToRay's own contract: the gizmo picks world-space handle geometry, never
 *  voxel space. `e` only needs `clientX`/`clientY` — callers driven by the input
 *  module's own gesture events (CSS px, not a real PointerEvent) pass a fabricated one. */
export function rayFromPointer(
  canvas: HTMLCanvasElement,
  e: Pick<PointerEvent, 'clientX' | 'clientY'>,
  camera: ViewSlice['camera'],
): Ray {
  const rect = canvas.getBoundingClientRect();
  const ndc: [number, number] = [
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -(((e.clientY - rect.top) / rect.height) * 2 - 1),
  ];
  const cam = cameraViewFor(camera, [canvas.width, canvas.height]);
  const basis = cameraBasis(cam.eyeMpc, cam.targetMpc, cam.upMpc, UNROTATED_BASIS_BOX);
  const aspect = cam.viewportPx[0] / cam.viewportPx[1];
  return screenToRay(cam.eyeMpc, basis, cam.fovYRad, aspect, ndc);
}
