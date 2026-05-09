/**
 * Synthetic 3D Gaussian-blob cube generator.
 *
 * Used for the smoke test in the scalar volume renderer rollout — gives
 * us a recognisable, axially-symmetric, box-centred shape so visual
 * regressions are obvious (a blown-up corner means the AABB intersection
 * is wrong; a smeared-out blob means the linear-interpolation sampler
 * disagreed with the cube model matrix; an off-centre peak means the
 * model matrix translation has the wrong sign).
 *
 * Pure: no I/O.  Returns a fully-formed `ScalarCube` ready to hand to
 * the renderer's `addField`.
 *
 * Why a separate file and not inline in the engine: the smoke test wants
 * to construct the cube outside the engine bootstrap so we can also
 * use it as a vitest fixture for any future renderer-level integration
 * test.  Keeping the helper in `src/data/` (alongside the format
 * encoder/decoder) puts it next to the type it produces.
 */

import type { ScalarCube, ScalarFieldFrameKind } from '../@types/ScalarCube';

export type SyntheticGaussianOptions = {
  /** Cube edge length in voxels (cubic grid).  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Standard deviation of the Gaussian, in voxels.  Default dims/6. */
  sigmaVoxels?: number;
};

export function makeSyntheticGaussianCube(opts: SyntheticGaussianOptions = {}): ScalarCube {
  const dims = opts.dims ?? 64;
  const frameKind = opts.frameKind ?? 'equatorial-cartesian';
  const boxSizeMpc = opts.boxSizeMpc ?? 400;
  const sigma = opts.sigmaVoxels ?? dims / 6;
  const voxelSize = boxSizeMpc / dims;
  const centre = (dims - 1) / 2;
  const inv2Sigma2 = 1 / (2 * sigma * sigma);

  const voxels = new Uint16Array(dims * dims * dims);
  for (let z = 0; z < dims; z++) {
    for (let y = 0; y < dims; y++) {
      for (let x = 0; x < dims; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const dz = z - centre;
        const r2 = dx * dx + dy * dy + dz * dz;
        const value = Math.exp(-r2 * inv2Sigma2); // [0, 1]
        voxels[x + y * dims + z * dims * dims] = floatToF16(value);
      }
    }
  }

  return {
    dims: [dims, dims, dims],
    voxels,
    frameKind,
    origin: [-boxSizeMpc / 2, -boxSizeMpc / 2, -boxSizeMpc / 2],
    voxelSize,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    valueMin: 0,
    valueMax: 1,
  };
}

// ── f16 conversion helpers ──────────────────────────────────────────
//
// JS has no native f16, so we keep cube voxels as Uint16 holding the
// raw IEEE 754 binary16 bits.  These two helpers convert between f32
// and that representation.  Used here for the Gaussian generator and
// exposed for tests; the renderer uploads the Uint16 directly to a
// WebGPU `r16float` texture (which understands the same bit layout).
//
// Implementation borrowed from the standard "Float16Array shim" trick:
// a 1-element Float32Array view into the same buffer as a Uint32Array
// gives us bit-level access to the f32 representation, which we then
// re-encode into f16.

const f32Buf = new ArrayBuffer(4);
const f32View = new Float32Array(f32Buf);
const u32View = new Uint32Array(f32Buf);

export function floatToF16(value: number): number {
  f32View[0] = value;
  const x = u32View[0]!;
  const sign = (x >> 31) & 0x1;
  let exp = (x >> 23) & 0xff;
  let mant = x & 0x7fffff;
  // Handle special values + denormals roughly — adequate for cubes that
  // ship values in [0, 1] (no NaN/Inf, no negatives expected).
  if (exp === 0xff) {
    return (sign << 15) | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 0x1f) return (sign << 15) | 0x7c00; // Inf
  if (exp <= 0) {
    if (exp < -10) return sign << 15; // underflow → 0
    mant = (mant | 0x800000) >> (1 - exp);
    return (sign << 15) | (mant >> 13);
  }
  return (sign << 15) | (exp << 10) | (mant >> 13);
}

export function f16ToFloat(bits: number): number {
  const sign = (bits >> 15) & 0x1;
  const exp = (bits >> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) {
    if (mant === 0) return sign ? -0 : 0;
    // Denormal — rebuild as f32.
    const value = mant / 1024 / 16384;
    return sign ? -value : value;
  }
  if (exp === 0x1f) return mant ? NaN : sign ? -Infinity : Infinity;
  const e = exp - 15;
  const value = (1 + mant / 1024) * Math.pow(2, e);
  return sign ? -value : value;
}
