/**
 * raycastTerrain — first ray/terrain crossing in body-fixed metres, `null` on a
 * miss. Pure: no memo, no cache, no warm start from a prior call (the camera
 * path holds no state of its own — user ruling 2026-09-17). Algorithm: spec
 * §8.1, "Built in F3c".
 */
import type { BodyLocalRay } from '../../@types/camera/BodyLocalRay';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { SurfacePick } from '../../@types/camera/SurfacePick';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { RAYCAST_BISECTION_ITERATION_CAP } from '../../data/camera/raycastBisectionIterationCap';
import { RAYCAST_CLOSING_RATE_FLOOR } from '../../data/camera/raycastClosingRateFloor';
import { RAYCAST_MIN_STEP_M } from '../../data/camera/raycastMinStepM';
import { RAYCAST_SAMPLE_BUDGET } from '../../data/camera/raycastSampleBudget';
import { dot3 } from '../math/dot3';
import { raySphereRoots } from '../math/raySphereRoots';

export function raycastTerrain(
  ray: BodyLocalRay,
  innerRadiusM: number,
  outerRadiusM: number,
  groundRadiusAtM: GroundRadiusLookup,
  toleranceM: number,
): SurfacePick | null {
  const { originM, dir } = ray;
  const centreM = BODY_LOCAL_FRAME.centreM;

  const pointAt = (t: number): Vec3 => [
    originM[0] + dir[0] * t,
    originM[1] + dir[1] * t,
    originM[2] + dir[2] * t,
  ];
  const pickAt = (point: Readonly<Vec3>, radius: number): SurfacePick => ({
    pointM: [point[0], point[1], point[2]],
    incidence: dot3(dir, point) / radius,
  });

  // Terrain cannot lie outside the relief shells (declared per-body data, not
  // streamed), so a miss against either bounds the search before any sample.
  const outerRoots = raySphereRoots(originM, dir, centreM, outerRadiusM);
  if (outerRoots === null || outerRoots[1] <= 0) return null;
  const innerRoots = raySphereRoots(originM, dir, centreM, innerRadiusM);
  const t0 = Math.max(0, outerRoots[0]);
  const t1 = innerRoots !== null ? innerRoots[0] : outerRoots[1];
  if (t1 <= t0) return null;

  const p0 = pointAt(t0);
  const r0 = Math.hypot(p0[0], p0[1], p0[2]);
  const groundRadius0 = groundRadiusAtM(p0);
  const f0 = r0 - groundRadius0;
  if (f0 < 0) {
    // The floor stands on the 17×17 header grid while the shader draws 129²,
    // so the eye can already be inside the drawn surface near a sharp peak.
    // Marching forward from here would find the exit face on the mountain's
    // far side; answer the eye's own nadir ground point instead.
    const scale = groundRadius0 / r0;
    return pickAt([p0[0] * scale, p0[1] * scale, p0[2] * scale], groundRadius0);
  }

  const eDotD = dot3(originM, dir);
  const stepCapM = (t1 - t0) / RAYCAST_SAMPLE_BUDGET;

  let t = t0;
  let radius = r0;
  let f = f0;

  for (let i = 0; i < RAYCAST_SAMPLE_BUDGET && t < t1; i++) {
    // f/closingRate is the secant estimate of distance-to-surface; a fixed
    // step is not viable since a grazing chord spans ~670 km on Earth.
    const closingRate = Math.max(RAYCAST_CLOSING_RATE_FLOOR, -(eDotD + t) / radius);
    const rawStepM = f / closingRate;
    const upperBoundM = Math.min(t1 - t, stepCapM);
    const stepM = Math.min(Math.max(rawStepM, RAYCAST_MIN_STEP_M), upperBoundM);

    const nextT = t + stepM;
    const nextPoint = pointAt(nextT);
    const nextRadius = Math.hypot(nextPoint[0], nextPoint[1], nextPoint[2]);
    const nextF = nextRadius - groundRadiusAtM(nextPoint);

    if (nextF <= 0) {
      let tLo = t;
      let tHi = nextT;
      let bestPoint = nextPoint;
      let bestRadius = nextRadius;
      let bestF = nextF;
      for (let b = 0; b < RAYCAST_BISECTION_ITERATION_CAP; b++) {
        if (Math.abs(bestF) <= toleranceM) break;
        const midT = (tLo + tHi) / 2;
        bestPoint = pointAt(midT);
        bestRadius = Math.hypot(bestPoint[0], bestPoint[1], bestPoint[2]);
        bestF = bestRadius - groundRadiusAtM(bestPoint);
        if (bestF > 0) tLo = midT;
        else tHi = midT;
      }
      return pickAt(bestPoint, bestRadius);
    }

    t = nextT;
    radius = nextRadius;
    f = nextF;
  }

  return null;
}
