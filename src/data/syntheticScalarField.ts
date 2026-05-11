/**
 * Synthetic 3D scalar-field generators for smoke-testing the volume
 * renderer.  Three test fixtures, each chosen to surface a distinct
 * class of bug:
 *
 *   - `makeSyntheticGaussianCube`  : centred isotropic blob.  Catches
 *      AABB-intersection / translation-sign / sampler-orientation bugs.
 *      An off-centre peak or smeared blob is visually obvious.
 *
 *   - `makeCartesianGridCube`      : three sets of axis-aligned planes
 *      at regular Mpc intervals.  Catches axis-orientation bugs (which
 *      way is +x?), voxel-scale bugs (do gridlines fall at expected
 *      Mpc?), and frame-rotation bugs (an equatorial-frame grid looks
 *      different to a supergalactic-frame grid even with identical
 *      voxel data).
 *
 *   - `makeSphericalGridCube`      : concentric shells at fixed radii
 *      from the origin, plus radial spokes through ±X / ±Y / ±Z.
 *      Catches origin-alignment bugs (does the world origin sit at the
 *      voxel grid centre?) and gives the user an intuitive "how big is
 *      this space?" cue from any viewing angle.
 *
 * All three are pure — no I/O — and return a fully-formed `ScalarCube`
 * ready to hand to the renderer's `addField`.  Kept in `src/data/`
 * (alongside the format encoder/decoder) so they live next to the type
 * they produce and can also serve as vitest fixtures for future
 * renderer-level integration tests.
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
    // Palette + densityScale presentation defaults live in
    // `src/data/volumeFieldDefaults.ts` keyed by the renderer's field
    // handle ('debug-gaussian'), no longer encoded in the cube.
    valueMin: 0,
    valueMax: 1,
  };
}

// ── Cartesian grid ──────────────────────────────────────────────────

export type CartesianGridOptions = {
  /** Cube edge length in voxels.  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Spacing between successive grid planes in Mpc.  Default 50. */
  gridSpacingMpc?: number;
  /** Half-width of the falloff bell on either side of a plane, in Mpc.
   *  Default 3 — roughly half a voxel at default 64³ / 400 Mpc, so the
   *  planes read as crisp lines rather than fat slabs. */
  lineSigmaMpc?: number;
};

/**
 * Three sets of axis-aligned planes spaced `gridSpacingMpc` apart along
 * X, Y, Z.  At each voxel the value is `max(falloff_x, falloff_y,
 * falloff_z)` where `falloff_axis = exp(-d² / 2σ²)` and `d` is the
 * distance from the voxel centre to the nearest grid plane on that
 * axis.
 *
 * Why three independent falloffs combined by `max` rather than three
 * planes intersected by `min` (giving "lines only"):  planes are cheap
 * to compute, read clearly as orthogonal sheets, and naturally
 * brighten where two/three planes overlap (gridlines / gridpoints
 * look like high-density nodes), which is the visual cue we want.
 * Lines-only would require a different combiner and would be visually
 * sparser.
 *
 * The world origin (0, 0, 0) is exactly on a plane on each axis when
 * `gridSpacingMpc` divides `boxSizeMpc / 2` evenly (true for the
 * defaults: 200 / 50 = 4).  This makes "is the origin at voxel
 * centre?" trivially answerable: a clean glow at the box centre.
 */
export function makeCartesianGridCube(opts: CartesianGridOptions = {}): ScalarCube {
  const dims = opts.dims ?? 64;
  const frameKind = opts.frameKind ?? 'equatorial-cartesian';
  const boxSizeMpc = opts.boxSizeMpc ?? 400;
  const gridSpacingMpc = opts.gridSpacingMpc ?? 50;
  const lineSigmaMpc = opts.lineSigmaMpc ?? 3;
  const voxelSize = boxSizeMpc / dims;
  const origin = -boxSizeMpc / 2;
  const inv2Sigma2 = 1 / (2 * lineSigmaMpc * lineSigmaMpc);
  const halfSpacing = gridSpacingMpc / 2;

  // Distance from a world coord to the nearest grid plane on its axis.
  // Uses the symmetric-modulo trick: the result is in [0, halfSpacing].
  const distToPlane = (w: number): number => {
    const m = ((w % gridSpacingMpc) + gridSpacingMpc) % gridSpacingMpc; // positive mod
    return m > halfSpacing ? gridSpacingMpc - m : m;
  };

  const voxels = new Uint16Array(dims * dims * dims);
  for (let z = 0; z < dims; z++) {
    const wz = origin + (z + 0.5) * voxelSize;
    const dz = distToPlane(wz);
    const fz = Math.exp(-dz * dz * inv2Sigma2);
    for (let y = 0; y < dims; y++) {
      const wy = origin + (y + 0.5) * voxelSize;
      const dy = distToPlane(wy);
      const fy = Math.exp(-dy * dy * inv2Sigma2);
      for (let x = 0; x < dims; x++) {
        const wx = origin + (x + 0.5) * voxelSize;
        const dx = distToPlane(wx);
        const fx = Math.exp(-dx * dx * inv2Sigma2);
        const value = Math.max(fx, fy, fz);
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
    // Palette + densityScale presentation defaults live in
    // `src/data/volumeFieldDefaults.ts` keyed by the renderer's field
    // handle ('debug-cartesian'), no longer encoded in the cube.
    valueMin: 0,
    valueMax: 1,
  };
}

// ── Spherical grid ──────────────────────────────────────────────────

export type SphericalGridOptions = {
  /** Cube edge length in voxels.  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Spacing between successive shells in Mpc.  Default 50 (so shells
   *  appear at 50, 100, 150, … from the origin). */
  shellSpacingMpc?: number;
  /** Half-width of the falloff on either side of a shell radius, in
   *  Mpc.  Default 3. */
  shellSigmaMpc?: number;
  /** Half-width of the falloff for a radial spoke (perpendicular
   *  distance to the axis), in Mpc.  Default 2 — slightly tighter than
   *  the shells so spokes read as lines, not tubes. */
  spokeSigmaMpc?: number;
};

/**
 * Concentric spherical shells centred on the world origin, plus six
 * radial spokes along ±X / ±Y / ±Z.  At each voxel:
 *
 *   value = max(shellFalloff(r), spokeFalloff(min perpendicular axis))
 *
 * where `r = √(wx² + wy² + wz²)`, `shellFalloff(r) = exp(-d² / 2σ²)`
 * with `d = symmetric-mod(r, shellSpacing)`, and the spoke falloff is
 * the max of three perpendicular-distance Gaussians (one per axis).
 *
 * Why shells + spokes rather than shells alone:  shells alone are
 * ambiguous from a single viewpoint — you can see arcs but not where
 * they centre.  Spokes through the origin make "this is the centre"
 * unmistakable from any angle, and as a bonus give axis labels (the
 * spoke pointing toward you is your camera's gaze axis).
 *
 * No spoke at the origin itself is needed — the three perpendicular-
 * axis distances all hit zero there, so the spoke contribution is
 * already 1 at (0, 0, 0).
 */
export function makeSphericalGridCube(opts: SphericalGridOptions = {}): ScalarCube {
  const dims = opts.dims ?? 64;
  const frameKind = opts.frameKind ?? 'equatorial-cartesian';
  const boxSizeMpc = opts.boxSizeMpc ?? 400;
  const shellSpacingMpc = opts.shellSpacingMpc ?? 50;
  const shellSigmaMpc = opts.shellSigmaMpc ?? 3;
  const spokeSigmaMpc = opts.spokeSigmaMpc ?? 2;
  const voxelSize = boxSizeMpc / dims;
  const origin = -boxSizeMpc / 2;
  const invShellSigma2 = 1 / (2 * shellSigmaMpc * shellSigmaMpc);
  const invSpokeSigma2 = 1 / (2 * spokeSigmaMpc * spokeSigmaMpc);
  const halfShellSpacing = shellSpacingMpc / 2;

  const voxels = new Uint16Array(dims * dims * dims);
  for (let z = 0; z < dims; z++) {
    const wz = origin + (z + 0.5) * voxelSize;
    for (let y = 0; y < dims; y++) {
      const wy = origin + (y + 0.5) * voxelSize;
      for (let x = 0; x < dims; x++) {
        const wx = origin + (x + 0.5) * voxelSize;
        const r = Math.sqrt(wx * wx + wy * wy + wz * wz);

        // Shell: distance to nearest shell radius (multiple of spacing).
        const m = r % shellSpacingMpc;
        const shellD = m > halfShellSpacing ? shellSpacingMpc - m : m;
        const shellValue = Math.exp(-shellD * shellD * invShellSigma2);

        // Spokes: perpendicular distance to ±X axis = √(y² + z²); to
        // ±Y axis = √(x² + z²); to ±Z axis = √(x² + y²).  Each axis
        // covers both + and − halves of itself (a single spoke runs
        // through the origin in both directions).
        const dToX = Math.sqrt(wy * wy + wz * wz);
        const dToY = Math.sqrt(wx * wx + wz * wz);
        const dToZ = Math.sqrt(wx * wx + wy * wy);
        const spokeValue = Math.max(
          Math.exp(-dToX * dToX * invSpokeSigma2),
          Math.exp(-dToY * dToY * invSpokeSigma2),
          Math.exp(-dToZ * dToZ * invSpokeSigma2),
        );

        const value = Math.max(shellValue, spokeValue);
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
    // Palette + densityScale presentation defaults live in
    // `src/data/volumeFieldDefaults.ts` keyed by the renderer's field
    // handle ('debug-spherical'), no longer encoded in the cube.
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
