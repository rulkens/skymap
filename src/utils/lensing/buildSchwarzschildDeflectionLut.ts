/**
 * CPU-side Schwarzschild bending-angle LUT (units r_s = 1, so b is "in r_s").
 * Photon orbits obey (du/dphi)^2 = f(u) = 1/b^2 - u^2 + u^3, u = 1/r; the
 * turning point u0 (root of f in [0, 2/3], the photon-sphere bound) is found
 * by bisection. The bending integral has an integrable sqrt singularity at
 * u0; substituting u = u0*sin(theta) regularises it (cos(theta) and sqrt(f)
 * both vanish linearly as theta -> pi/2), so Simpson's rule over theta
 * converges normally. See the test file for the theta=pi/2 endpoint limit
 * and an independent cross-check of the resulting values.
 */

import type { SchwarzschildDeflectionLut } from '../../@types/lensing/SchwarzschildDeflectionLut';

const CRITICAL_IMPACT_PARAM_RS = (3 * Math.sqrt(3)) / 2; // b_c = 3root3/2 r_s, photon-sphere impact parameter
const MIN_IMPACT_PARAM_RS = 1; // below b_c throughout: exercises the capture sentinel
const MAX_IMPACT_PARAM_RS = 50; // deep weak-field: 2/b ~ 0.04 rad, matches the asymptotic formula closely
const PHOTON_SPHERE_U = 2 / 3; // u = 1/r at r = 1.5 r_s, the upper bound for the turning-point search
const BISECTION_ITERATIONS = 80; // well past double precision (2^-80 interval width)
const QUADRATURE_INTERVALS = 400; // even, composite Simpson's rule sub-intervals over theta

function turningPointU(invBSq: number): number {
  let lo = 0;
  let hi = PHOTON_SPHERE_U;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const g = mid * mid * mid - mid * mid + invBSq;
    if (g > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function bendingAngleRadians(impactParamRs: number): number {
  if (impactParamRs <= CRITICAL_IMPACT_PARAM_RS) {
    return Infinity; // no turning point outside the photon sphere: captured
  }

  const invBSq = 1 / (impactParamRs * impactParamRs);
  const u0 = turningPointU(invBSq);
  const endpointValue = Math.sqrt(2 / (2 - 3 * u0)); // theta -> pi/2 limit, derived in the test file

  const sampleAt = (theta: number): number => {
    const u = u0 * Math.sin(theta);
    const f = Math.max(0, u * u * u - u * u + invBSq); // clamp: rounding can dip f just below 0 at theta near pi/2
    return (u0 * Math.cos(theta)) / Math.sqrt(f);
  };

  const step = Math.PI / 2 / QUADRATURE_INTERVALS;
  let simpsonSum = sampleAt(0) + endpointValue;
  for (let i = 1; i < QUADRATURE_INTERVALS; i++) {
    simpsonSum += (i % 2 === 0 ? 2 : 4) * sampleAt(i * step);
  }
  const halfDeflection = (step / 3) * simpsonSum;
  return 2 * halfDeflection - Math.PI;
}

export function buildSchwarzschildDeflectionLut(sampleCount: number): SchwarzschildDeflectionLut {
  const minImpactParamRs = MIN_IMPACT_PARAM_RS;
  const maxImpactParamRs = MAX_IMPACT_PARAM_RS;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = sampleCount > 1 ? i / (sampleCount - 1) : 0;
    const impactParamRs = minImpactParamRs + t * (maxImpactParamRs - minImpactParamRs);
    samples[i] = bendingAngleRadians(impactParamRs);
  }
  return { samples, minImpactParamRs, maxImpactParamRs };
}
