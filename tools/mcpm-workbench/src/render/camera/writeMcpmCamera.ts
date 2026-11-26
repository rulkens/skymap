import type { GridBox } from '../../../@types/grid/GridBox';
import { worldToVoxel } from '../../grid/box/worldToVoxel';
import { cameraBasis } from './cameraBasis';
import type { McpmCameraView } from '../../../@types/render/camera/McpmCameraView';

/** Fill `out` (>= 16 floats) with camera.wesl's McpmCamera for `view`, in the voxel frame. */
export function writeMcpmCamera(out: Float32Array, box: GridBox, view: McpmCameraView): void {
  const eye = worldToVoxel(box, [view.eyeMpc[0], view.eyeMpc[1], view.eyeMpc[2]]);
  const basis = cameraBasis(view.eyeMpc, view.targetMpc, view.upMpc, box);
  const [width, height] = view.viewportPx;

  out.set(eye, 0);
  out[3] = Math.tan(view.fovYRad * 0.5);
  out.set(basis.right, 4);
  out[7] = width / height;
  out.set(basis.up, 8);
  out[11] = width;
  out.set(basis.forward, 12);
  out[15] = height;
}
