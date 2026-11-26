import type { Vec3 } from '../../../../../src/@types/math/Vec3';

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
