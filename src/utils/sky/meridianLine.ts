import type { Vec3 } from '../../@types/math/Vec3';

const RAD = Math.PI / 180;

/**
 * meridianLine — the half great circle of constant longitude `lonDeg`, south
 * pole to north pole, as unit directions in a frame whose +z is the pole and +x
 * longitude zero, in equal steps of at most `maxStepDeg`.
 */
export function meridianLine(lonDeg: number, maxStepDeg: number): Vec3[] {
  const steps = Math.ceil(180 / maxStepDeg);
  const c = Math.cos(lonDeg * RAD);
  const s = Math.sin(lonDeg * RAD);
  return Array.from({ length: steps + 1 }, (_, i): Vec3 => {
    const lat = (i / steps - 0.5) * Math.PI;
    return [Math.cos(lat) * c, Math.cos(lat) * s, Math.sin(lat)];
  });
}
