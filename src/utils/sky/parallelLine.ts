import type { Vec3 } from '../../@types/math/Vec3';

const RAD = Math.PI / 180;

/**
 * parallelLine — the circle of constant latitude `latDeg`, as a closed loop of
 * unit directions (first point repeated last) in a frame whose +z is the pole
 * and +x longitude zero. Steps are equal and at most `maxStepDeg` of longitude,
 * which bounds the arc between neighbours on every parallel, the equator's
 * included.
 */
export function parallelLine(latDeg: number, maxStepDeg: number): Vec3[] {
  const steps = Math.ceil(360 / maxStepDeg);
  const z = Math.sin(latDeg * RAD);
  const r = Math.cos(latDeg * RAD);
  return Array.from({ length: steps + 1 }, (_, i): Vec3 => {
    const lon = ((i % steps) / steps) * 2 * Math.PI;
    return [r * Math.cos(lon), r * Math.sin(lon), z];
  });
}
