/**
 * Algorithmic derivation (comments.md budget exception): the numbered
 * pipeline below is the source of truth for `computeDescriptor`'s numeric
 * constants and operation order — the fit loop compares descriptors of the
 * reference and the render, so any drift here shifts the optimum.
 *
 * computeDescriptor — extract a rotation- and scale-invariant
 * `GalaxyDescriptor` from an RGBA buffer (a real photo or one of our
 * renders).
 *
 * The pipeline, in order:
 *   1. Estimate the sky background as the median luma of the border ring, and
 *      subtract it from every pixel's luma (clamped at 0).
 *   2. Cap positive luma at its 97th percentile (when >20 lit pixels) so a
 *      handful of blown-out / point-source pixels can't dominate the extended
 *      structure the descriptor is meant to capture.
 *   3. Flux-weighted centroid + second moments → axis ratio q from the moment
 *      eigenvalues (1 = round, →0 edge-on).
 *   4. Circular half-light radius rHalf (floored at 2 px).
 *   5. Radial flux fraction (NB bins over rho = r/rHalf ∈ [0,3)) and an
 *      inner/outer (R−B)/(R+G+B+1) colour gradient.
 *   6. Azimuthal harmonics m=1..6 in the 0.5–1.9·rHalf annulus: per-radius
 *      mean subtracted so only angular modulation survives, DFT'd and
 *      normalised by the annulus mean brightness (arm count / strength).
 *   7. A dust index: the darker-than-local-mean flux as a fraction of the
 *      annulus mean.
 *
 * Returns null when the total (background-subtracted) flux is negligible.
 *
 * The `!` non-null assertions throughout are for `noUncheckedIndexedAccess`:
 * every index here is provably in-bounds (loop bounds match the array
 * lengths), so the reads are never actually undefined.
 */
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';

const NB = 15; // radial profile bins (rho = r / rHalf, 0..3)
const NA = 48; // azimuthal bins for arm harmonics

function lum(rgba: Uint8ClampedArray | Uint8Array, j: number): number {
  return 0.299 * rgba[j]! + 0.587 * rgba[j + 1]! + 0.114 * rgba[j + 2]!;
}

export function computeDescriptor(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
): GalaxyDescriptor | null {
  const N = size;
  const L = new Float32Array(N * N);
  const Rc = new Float32Array(N * N);
  const Gc = new Float32Array(N * N);
  const Bc = new Float32Array(N * N);
  // border median as background estimate
  const border: number[] = [];
  for (let x = 0; x < N; x++) {
    border.push(lum(rgba, x * 4), lum(rgba, ((N - 1) * N + x) * 4));
  }
  for (let y = 0; y < N; y++) {
    border.push(lum(rgba, y * N * 4), lum(rgba, (y * N + N - 1) * 4));
  }
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1]!;
  for (let i = 0; i < N * N; i++) {
    const j = i * 4;
    const r = rgba[j]!,
      g = rgba[j + 1]!,
      b = rgba[j + 2]!;
    let l = 0.299 * r + 0.587 * g + 0.114 * b - bg;
    if (l < 0) l = 0;
    L[i] = l;
    Rc[i] = r;
    Gc[i] = g;
    Bc[i] = b;
  }
  // cap bright point-sources / saturated cores at a high percentile so the
  // descriptor reflects extended structure, not a few blown-out pixels
  const pos: number[] = [];
  for (let i = 0; i < N * N; i++) if (L[i]! > 0) pos.push(L[i]!);
  if (pos.length > 20) {
    pos.sort((a, b) => a - b);
    const cap = pos[Math.floor(pos.length * 0.97)] || 1;
    for (let i = 0; i < N * N; i++) if (L[i]! > cap) L[i] = cap;
  }
  // centroid + total
  let T = 0,
    cx = 0,
    cy = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      if (l <= 0) continue;
      T += l;
      cx += x * l;
      cy += y * l;
    }
  if (T < 1e-6) return null;
  cx /= T;
  cy /= T;
  // second moments -> axis ratio q
  let mxx = 0,
    myy = 0,
    mxy = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      if (l <= 0) continue;
      const dx = x - cx,
        dy = y - cy;
      mxx += l * dx * dx;
      myy += l * dy * dy;
      mxy += l * dx * dy;
    }
  mxx /= T;
  myy /= T;
  mxy /= T;
  const tr = mxx + myy,
    det = mxx * myy - mxy * mxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc,
    l2 = Math.max(0, tr / 2 - disc);
  const q = Math.sqrt(l2 / Math.max(l1, 1e-6)); // 1=round, ->0 edge-on
  // half-light radius (circular)
  const dists: Array<[number, number]> = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      if (l <= 0) continue;
      dists.push([Math.hypot(x - cx, y - cy), l]);
    }
  dists.sort((a, b) => a[0] - b[0]);
  let acc = 0,
    rHalf = 1;
  for (const [d, l] of dists) {
    acc += l;
    if (acc >= T * 0.5) {
      rHalf = Math.max(d, 2);
      break;
    }
  }

  // radial flux fraction + color gradient
  const fluxFrac = new Float32Array(NB);
  let inR = 0,
    inW = 0,
    outR = 0,
    outW = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      if (l <= 0) continue;
      const rho = Math.hypot(x - cx, y - cy) / rHalf;
      const bi = Math.min(NB - 1, Math.floor((rho / 3) * NB));
      if (bi >= 0) fluxFrac[bi] = fluxFrac[bi]! + l;
      const i = y * N + x;
      const cch = (Rc[i]! - Bc[i]!) / (Rc[i]! + Gc[i]! + Bc[i]! + 1);
      if (rho < 0.6) {
        inR += cch * l;
        inW += l;
      } else if (rho < 2.0) {
        outR += cch * l;
        outW += l;
      }
    }
  for (let i = 0; i < NB; i++) fluxFrac[i] = fluxFrac[i]! / T;
  const colorInner = inW > 0 ? inR / inW : 0;
  const colorOuter = outW > 0 ? outR / outW : 0;

  // azimuthal harmonics in the disk annulus (arm count / strength)
  // subtract per-radius mean so only angular modulation remains
  const RN = 10;
  const rMean = new Float32Array(RN),
    rCnt = new Float32Array(RN);
  const inAnn = (rho: number): boolean => rho >= 0.5 && rho <= 1.9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      if (l <= 0) continue;
      const rho = Math.hypot(x - cx, y - cy) / rHalf;
      if (!inAnn(rho)) continue;
      const ri = Math.min(RN - 1, Math.floor(((rho - 0.5) / 1.4) * RN));
      rMean[ri] = rMean[ri]! + l;
      rCnt[ri] = rCnt[ri]! + 1;
    }
  for (let i = 0; i < RN; i++) rMean[i] = rCnt[i]! > 0 ? rMean[i]! / rCnt[i]! : 0;
  const az = new Float32Array(NA),
    azc = new Float32Array(NA);
  let dustNeg = 0,
    dustT = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = L[y * N + x]!;
      const dx = x - cx,
        dy = y - cy;
      const rho = Math.hypot(dx, dy) / rHalf;
      if (!inAnn(rho)) continue;
      const ri = Math.min(RN - 1, Math.floor(((rho - 0.5) / 1.4) * RN));
      const resid = l - rMean[ri]!;
      const ai = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * NA;
      const aiInt = ai | 0;
      az[aiInt % NA] = az[aiInt % NA]! + resid;
      azc[aiInt % NA] = azc[aiInt % NA]! + 1;
      // dust: darker-than-local counts as absorption
      dustT += rMean[ri]!;
      if (resid < 0) dustNeg += -resid;
    }
  for (let i = 0; i < NA; i++) az[i] = azc[i]! > 0 ? az[i]! / azc[i]! : 0;
  // DFT magnitudes m=1..6 normalised by annulus mean brightness
  const meanAnn = rMean.reduce((a, b) => a + b, 0) / RN || 1;
  const arm = new Float32Array(6);
  for (let m = 1; m <= 6; m++) {
    let re = 0,
      im = 0;
    for (let i = 0; i < NA; i++) {
      const th = (i / NA) * 2 * Math.PI;
      re += az[i]! * Math.cos(m * th);
      im += az[i]! * Math.sin(m * th);
    }
    arm[m - 1] = (Math.sqrt(re * re + im * im) / NA / meanAnn) * 2;
  }
  const dustIdx = dustT > 0 ? dustNeg / dustT : 0;

  return { q, rHalf, fluxFrac, colorInner, colorOuter, arm, dustIdx };
}
