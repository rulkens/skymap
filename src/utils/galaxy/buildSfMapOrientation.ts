/**
 * buildSfMapOrientation — structure-tensor crest orientation over a
 * `GalaxySfMap`'s oldActivity (B) channel, so dust can later elongate ALONG
 * emergent spurs instead of the analytic arm tangent. Pure: same inputs,
 * same `Float32Array` out, no engine state.
 *
 * Sign convention: gradient (cross-filament) double angle is
 * `(Jxx-Jyy, 2*Jxy)` — eigenvector of the LARGER eigenvalue, i.e. fastest
 * change, which is ACROSS a ridge. Along-filament is that rotated by π/2 in
 * real angle = π in double-angle = negated: `(Jyy-Jxx, -2*Jxy)`. Checked:
 * gx=1,gy=0 (edge along y) → grad angle 0 (x-axis, correct); negated →
 * along angle π/2 (y-axis, correct).
 */
import { sfMapRingRadius } from './sfMapRingRadius';
import type { GalaxySfMap } from '../../@types/galaxy/GalaxySfMap';
import type { GalaxySfMapOrientation } from '../../@types/galaxy/GalaxySfMapOrientation';

function gaussianKernel(sigmaTexels: number): Float64Array {
  const sigma = Math.max(sigmaTexels, 1e-6);
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + radius] = w;
    sum += w;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k]! /= sum;
  return kernel;
}

// Azimuth is periodic (wrap); the radial axis is not (clamp at rMin/rMax).
function blurAzimuth(field: Float32Array, az: number, rings: number, kernel: Float64Array): Float32Array {
  const radius = (kernel.length - 1) / 2;
  const out = new Float32Array(field.length);
  for (let r = 0; r < rings; r++) {
    const base = r * az;
    for (let a = 0; a < az; a++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const src = ((a + k) % az + az) % az;
        acc += field[base + src]! * kernel[k + radius]!;
      }
      out[base + a] = acc;
    }
  }
  return out;
}

function blurRing(field: Float32Array, az: number, rings: number, kernel: Float64Array): Float32Array {
  const radius = (kernel.length - 1) / 2;
  const out = new Float32Array(field.length);
  for (let a = 0; a < az; a++) {
    for (let r = 0; r < rings; r++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const src = Math.min(rings - 1, Math.max(0, r + k));
        acc += field[src * az + a]! * kernel[k + radius]!;
      }
      out[r * az + a] = acc;
    }
  }
  return out;
}

function blurLogPolar(field: Float32Array, az: number, rings: number, kernel: Float64Array): Float32Array {
  return blurRing(blurAzimuth(field, az, rings, kernel), az, rings, kernel);
}

export function buildSfMapOrientation(
  map: GalaxySfMap,
  sigmaTexels: number,
): GalaxySfMapOrientation {
  const { az, rings, rMin, rMax, data } = map;

  const oldActivity = new Float32Array(az * rings);
  for (let i = 0; i < oldActivity.length; i++) oldActivity[i] = data[i * 4 + 2]! / 255;

  const kernel = gaussianKernel(sigmaTexels);
  const smoothed = blurLogPolar(oldActivity, az, rings, kernel);

  // Log-polar is conformal: one az texel spans r*2π/az physically, one ring
  // texel spans r*ln(rMax/rMin)/(rings-1). Their ratio is r-INDEPENDENT, so
  // a single constant equalises the two derivative axes at every radius.
  // Derived via sfMapRingRadius itself (ratio of consecutive rings), never
  // by restating its log-radial formula.
  const azTexelSize = (2 * Math.PI) / az;
  const ringTexelSize = Math.log(
    sfMapRingRadius(1, rings, rMin, rMax) / sfMapRingRadius(0, rings, rMin, rMax),
  );
  const aspect = ringTexelSize / azTexelSize;

  const gx = new Float32Array(az * rings);
  const gy = new Float32Array(az * rings);
  for (let r = 0; r < rings; r++) {
    const base = r * az;
    const rPrev = Math.max(0, r - 1);
    const rNext = Math.min(rings - 1, r + 1);
    const rSpan = rNext - rPrev || 1;
    for (let a = 0; a < az; a++) {
      const aPrev = (a - 1 + az) % az;
      const aNext = (a + 1) % az;
      gx[base + a] = (smoothed[base + aNext]! - smoothed[base + aPrev]!) / 2;
      const gyRaw = (smoothed[rNext * az + a]! - smoothed[rPrev * az + a]!) / rSpan;
      gy[base + a] = gyRaw / aspect;
    }
  }

  const jxx = new Float32Array(az * rings);
  const jxy = new Float32Array(az * rings);
  const jyy = new Float32Array(az * rings);
  for (let i = 0; i < jxx.length; i++) {
    jxx[i] = gx[i]! * gx[i]!;
    jxy[i] = gx[i]! * gy[i]!;
    jyy[i] = gy[i]! * gy[i]!;
  }

  // The whole point of a structure tensor: blurring gx*gx etc. (rather than
  // gx, gy themselves) is what makes crest orientation well-defined at a
  // ridge peak, where the raw gradient is ~zero and its SIGN is ambiguous.
  const jxxB = blurLogPolar(jxx, az, rings, kernel);
  const jxyB = blurLogPolar(jxy, az, rings, kernel);
  const jyyB = blurLogPolar(jyy, az, rings, kernel);

  const out = new Float32Array(az * rings * 2);
  const eps = 1e-12;
  for (let i = 0; i < jxxB.length; i++) {
    const denom = jxxB[i]! + jyyB[i]!;
    if (denom < eps) {
      out[i * 2] = 0;
      out[i * 2 + 1] = 0;
      continue;
    }
    // = coherence * unit(along-double) folded into one division; see the
    // module header for the (Jyy-Jxx, -2*Jxy) sign derivation.
    out[i * 2] = (jyyB[i]! - jxxB[i]!) / denom;
    out[i * 2 + 1] = (-2 * jxyB[i]!) / denom;
  }

  return { az, rings, rMin, rMax, data: out };
}
