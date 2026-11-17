import type { Vec3 } from '../../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';

/**
 * The Sun minus the eye in AU, composed in f64, so the shaders' f32 never carries the eye's distance
 * from the origin. The Kepler compute's cull and the dot pass's placement both start from it.
 */
export function asteroidSunFromCamAu(eye: Readonly<Vec3>): Vec3 {
  const au = SCALE_UNITS.AU_TO_MPC;
  return [
    (RENDER_ORIGIN_MPC[0] - eye[0]) / au,
    (RENDER_ORIGIN_MPC[1] - eye[1]) / au,
    (RENDER_ORIGIN_MPC[2] - eye[2]) / au,
  ];
}
