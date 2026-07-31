/**
 * zoomPanGeodesic — van Wijk & Nuij's optimal zoom/pan path (IEEE InfoVis 2003,
 * eq. 9), parametrised by arc length in their perceptual metric
 * ds² = (ρ²/w²)du² + (1/(ρ²w²))dw², so constant ds/dt is constant perceived
 * velocity.
 *
 * `u` and `w` must share ONE world unit: `b` below adds w₁² − w₀² to
 * ρ⁴(u₁ − u₀)², so a unit mismatch silently shifts the pan/zoom balance rather
 * than failing. Spec (incl. both restructurings below), §2:
 * docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

import type { ZoomPanGeodesic } from '../../@types/camera/ZoomPanGeodesic';

export function zoomPanGeodesic(
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  rho: number,
): ZoomPanGeodesic {
  const du = u1 - u0;

  // Pure zoom (dollyTo, and every re-focus of an already-focused subject). bᵢ
  // divides by du, so this arm is mandatory — but on EXACT equality: only
  // du === 0 misbehaves, and an epsilon band would swap a correct path for an
  // approximation over a whole neighbourhood.
  if (du === 0) {
    const k = w1 < w0 ? -1 : 1;
    return {
      length: Math.abs(Math.log(w1 / w0)) / rho,
      at: (s) => ({ u: u0, w: w0 * Math.exp(k * rho * s) }),
    };
  }

  const rho2 = rho * rho;
  const dw2 = w1 * w1 - w0 * w0;
  const pan2 = rho2 * rho2 * du * du;
  // (−1)ⁱ: `+` for i = 0, `−` for i = 1. Backwards yields a plausible path
  // ending at the MIRROR of the destination.
  const b0 = (dw2 + pan2) / (2 * w0 * rho2 * du);
  const b1 = (dw2 - pan2) / (2 * w1 * rho2 * du);

  // asinh, never the paper's literal ln(−b + √(b²+1)): b reaches 1e37 at
  // skymap's scale range and that subtraction cancels to −Infinity for a third
  // of real endpoint pairs, poisoning `length` and every sample.
  const r0 = Math.asinh(-b0);
  const r1 = Math.asinh(-b1);

  return {
    length: (r1 - r0) / rho,
    at: (s) => {
      const cosh1 = Math.cosh(rho * s + r0);
      return {
        // sinh(ρs)/cosh(ρs+r₀), never the paper's literal
        // cosh(r₀)·tanh(ρs+r₀) − sinh(r₀): that subtracts two ~1e18 quantities
        // whose difference IS the answer, and returns exactly u₀ for small Δu.
        u: u0 + (w0 / rho2) * (Math.sinh(rho * s) / cosh1),
        w: (w0 * Math.cosh(r0)) / cosh1,
      };
    },
  };
}
