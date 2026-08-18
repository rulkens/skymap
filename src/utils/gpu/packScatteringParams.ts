/**
 * packScatteringParams — pure packer for the `ScatteringParams` uniform the
 * three LUT bakes read. Its twin is `struct ScatteringParams` in
 * `shaders/atmosphere/scattering.wesl`; keep the field order in lockstep, since
 * a drift raises no GPU error and iOS answers it with a dropped frame.
 *
 * The kind tags are `u32`, which is why this returns an `ArrayBuffer` with two
 * views rather than a bare `Float32Array`.
 */

import type { AtmosphereParams } from '../../@types/scene/AtmosphereParams';

/** Uniform slots for constituents. Neptune spends all four; no row has headroom past it. */
export const MAX_CONSTITUENTS = 4;

/** Byte size of `ScatteringParams` — 32-byte header + 4 × 48-byte constituents. */
export const SCATTERING_PARAMS_BYTES = 224;

const CONSTITUENT_BASE_F32 = 8; // byte 32
const CONSTITUENT_STRIDE_F32 = 12; // 48 bytes

/** The subset of a row this buffer carries: geometry plus the constituent list. */
type ScatteringInput = Pick<
  AtmosphereParams,
  'planetRadiusKm' | 'atmosphereTopKm' | 'groundAlbedo' | 'constituents'
>;

export function packScatteringParams(params: ScatteringInput): ArrayBuffer {
  const count = params.constituents.length;
  if (count > MAX_CONSTITUENTS) {
    throw new Error(
      `packScatteringParams: ${count} constituents exceeds MAX_CONSTITUENTS (${MAX_CONSTITUENTS})`,
    );
  }

  const buf = new ArrayBuffer(SCATTERING_PARAMS_BYTES);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);

  f[0] = params.groundAlbedo[0];
  f[1] = params.groundAlbedo[1];
  f[2] = params.groundAlbedo[2];
  f[3] = params.planetRadiusKm;
  f[4] = params.atmosphereTopKm;
  u[5] = count;

  for (let i = 0; i < count; i++) {
    const c = params.constituents[i];
    if (c === undefined) continue;
    const b = CONSTITUENT_BASE_F32 + i * CONSTITUENT_STRIDE_F32;
    f[b] = c.scatter[0];
    f[b + 1] = c.scatter[1];
    f[b + 2] = c.scatter[2];
    f[b + 3] = c.phase.kind === 'henyeyGreenstein' ? c.phase.g : 0;
    f[b + 4] = c.absorb[0];
    f[b + 5] = c.absorb[1];
    f[b + 6] = c.absorb[2];
    // A tent's scale height is never read, but it must be FINITE: a compiler
    // that flattens the profile branch into a `select` evaluates both sides, and
    // `exp(-altitude / 0)` is the indeterminate-value trap that `densityTent`'s
    // own zero-width guard exists for. 1 is the cheapest finite value.
    f[b + 7] = c.profile.kind === 'exponential' ? c.profile.scaleHeightKm : 1;
    f[b + 8] = c.profile.kind === 'tent' ? c.profile.centerKm : 0;
    f[b + 9] = c.profile.kind === 'tent' ? c.profile.widthKm : 0;
    u[b + 10] = c.profile.kind === 'tent' ? 1 : 0;
    u[b + 11] = c.phase.kind === 'henyeyGreenstein' ? 1 : 0;
  }

  return buf;
}
