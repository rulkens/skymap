import type { ChromaCalibration } from '../../../src/@types/scene/ChromaCalibration';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Rec.709 luminance weights — the `Y` every chroma quantity below divides by. */
const LUM: Vec3 = [0.2126, 0.7152, 0.0722];

/**
 * Orthonormal basis of the chroma plane `{ c : dot(LUM, c) = 0 }`, Gram-Schmidt
 * over `(1, 0, -Lr/Lb)` and `(0, 1, -Lg/Lb)` — "raise red (or green), pay for it
 * in blue so the luminance does not move". Derived rather than written out
 * because a `ChromaCalibration`'s coefficients are only meaningful in THIS
 * basis: the fit that produced them projected onto exactly these two vectors,
 * and a different (equally valid) basis of the same plane silently reinterprets
 * every number.
 */
function chromaBasis(): readonly [Vec3, Vec3] {
  const normalise = (v: Vec3): Vec3 => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const e1 = normalise([1, 0, -LUM[0] / LUM[2]]);
  const seed: Vec3 = [0, 1, -LUM[1] / LUM[2]];
  const overlap = seed[0] * e1[0] + seed[1] * e1[1] + seed[2] * e1[2];
  const e2 = normalise([
    seed[0] - overlap * e1[0],
    seed[1] - overlap * e1[1],
    seed[2] - overlap * e1[2],
  ]);
  return [e1, e2];
}

const [E1, E2] = chromaBasis();

/** sRGB EOTF, one entry per encoded byte (the decode runs 4x per pixel). */
const DECODE = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  DECODE[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB OETF, back to an encoded byte. */
function encode(linear: number): number {
  const v = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}

/**
 * panSharpenRgb — luminance from a panchromatic source, chroma from a colour
 * source, recombined into sRGB bytes with `calibration` applied to the chroma.
 *
 * Both inputs are display-referred sRGB, so both are linearised first: chroma
 * carried as `c = RGB_linear / Y - 1` is invariant to how brightly the colour
 * source was exposed, and stays in the plane orthogonal to `LUM` under any
 * calibration, so re-attaching it to a different luminance leaves that luminance
 * EXACTLY intact. That invariance is the whole reason the two sources need no
 * photometric matching — only the geometric alignment the caller guarantees by
 * resizing both to one grid.
 *
 * `luminance` is one byte per pixel, `chroma` three; the pixel grids must
 * already agree.
 */
export function panSharpenRgb(
  luminance: Uint8Array,
  chroma: Uint8Array,
  calibration: ChromaCalibration,
): Buffer {
  const pixels = luminance.length;
  if (chroma.length !== pixels * 3) {
    throw new Error(
      `panSharpenRgb: chroma has ${chroma.length} bytes, expected ${pixels * 3} for ${pixels} pixels`,
    );
  }
  const [[m00, m01], [m10, m11]] = calibration.matrix;
  const gain = calibration.gain;

  const out = Buffer.allocUnsafe(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const r = DECODE[chroma[i * 3]!]!;
    const g = DECODE[chroma[i * 3 + 1]!]!;
    const b = DECODE[chroma[i * 3 + 2]!]!;
    const y = LUM[0] * r + LUM[1] * g + LUM[2] * b;

    // A black chroma pixel carries no hue to recover (and would divide by ~0),
    // so it passes the luminance through as neutral grey.
    const cr = y > 1e-5 ? r / y - 1 : 0;
    const cg = y > 1e-5 ? g / y - 1 : 0;
    const cb = y > 1e-5 ? b / y - 1 : 0;

    const p0 = cr * E1[0] + cg * E1[1] + cb * E1[2];
    const p1 = cr * E2[0] + cg * E2[1] + cb * E2[2];
    const q0 = gain * (m00 * p0 + m01 * p1);
    const q1 = gain * (m10 * p0 + m11 * p1);

    const lum = DECODE[luminance[i]!]!;
    out[i * 3] = encode(lum * (1 + q0 * E1[0] + q1 * E2[0]));
    out[i * 3 + 1] = encode(lum * (1 + q0 * E1[1] + q1 * E2[1]));
    out[i * 3 + 2] = encode(lum * (1 + q0 * E1[2] + q1 * E2[2]));
  }
  return out;
}
