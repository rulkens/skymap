import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { worldToVoxel } from '../field/worldToVoxel';
import { cameraBasis } from './cameraBasis';

/**
 * The per-frame camera the splat and overlay passes take. Lengths are world Mpc (the
 * tool's only length unit); `viewportPx` is the drawable size, from which aspect and the
 * shader's pixel arithmetic both derive — passing it instead of a bare aspect keeps the
 * two from disagreeing.
 */
export type McpmCameraView = {
  readonly eyeMpc: Readonly<Vec3>;
  readonly targetMpc: Readonly<Vec3>;
  readonly upMpc: Readonly<Vec3>;
  readonly fovYRad: number;
  readonly viewportPx: readonly [number, number];
};

/** camera.wesl's McpmCamera: four vec3+scalar rows, 16-byte aligned throughout. */
export const MCPM_CAMERA_BYTES = 64;

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
