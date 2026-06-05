/**
 * flowFieldFrame.ts — the parameterised sibling of `coordinates.ts`'s
 * hardcoded `sgToVoxelIndex`, used to map a sky anchor (RA/Dec/distance)
 * into the flow cube's continuous voxel space.
 *
 * Why a separate, parameterised helper instead of reusing
 * `tools/utils/math/coordinates.ts:sgToVoxelIndex`?  That function bakes in
 * the CF-4 density box geometry (origin -500 Mpc, voxel 1000/128 Mpc) — its
 * docstring is explicit that it's coupled to that specific catalog.  The flow
 * cube *happens* to share that geometry today, but the contract here is "given
 * a cube's own {origin, voxelSizeMpc, n}, locate this anchor" — a contract the
 * builder's frame self-check AND the frame-contract test both consume.  Sharing
 * one function means the two can't drift: if the flow box ever changes
 * resolution or extent, this stays correct because it reads the geometry from
 * `meta` rather than module constants.
 *
 * We deliberately do NOT modify `coordinates.ts` to consolidate the two: a
 * second consumer of the *parameterised* form is not yet a third consumer of
 * the *hardcoded* form, and the project convention is to consolidate on the
 * third occurrence, not the second.  If a third volume needs this, that's the
 * moment to lift the hardcoded constants into a shared parameterised core.
 *
 * Pure — no I/O, no GPU.  Reuses the existing `raDecDistToEqCart` +
 * `eqToSg` helpers so the equatorial → supergalactic chain has a single
 * implementation across the codebase.
 */

import type { Vec3 } from '../../src/@types/math/Vec3';
import { raDecDistToEqCart } from '../../src/utils/math/raDecDistToEqCart';
import { eqToSg } from '../utils/math/coordinates';

/**
 * Locate a sky anchor inside a flow/scalar cube, returning its continuous
 * voxel coordinate and whether it falls within the cube's bounds.
 *
 * The conversion mirrors `coordinates.ts:sgToVoxelIndex` exactly —
 * `raDecDistToEqCart(anchor)` → `eqToSg(eq)` → linear rescale per axis —
 * but takes the box geometry from `meta` rather than hardcoded CF-4
 * constants, so it works for any cube.
 *
 * `inBounds` is true iff every axis lands in `[0, meta.n)`.  We report it
 * rather than throwing so the builder's self-check can log a sanity line and
 * the test can assert on it without try/catch.
 *
 * @param anchor  Sky position in catalogue convention (RA hours, Dec deg, dist Mpc).
 * @param meta    The target cube's geometry: lower-corner `origin` of voxel
 *                (0,0,0) in supergalactic-Cartesian Mpc, the physical voxel
 *                edge `voxelSizeMpc`, and the per-axis voxel count `n`.
 */
export function attractorVoxel(
  anchor: { raHours: number; decDeg: number; distMpc: number },
  meta: { origin: Vec3; voxelSizeMpc: number; n: number },
): { voxel: Vec3; inBounds: boolean } {
  const sg = eqToSg(raDecDistToEqCart(anchor));
  const voxel: Vec3 = [
    (sg[0] - meta.origin[0]) / meta.voxelSizeMpc,
    (sg[1] - meta.origin[1]) / meta.voxelSizeMpc,
    (sg[2] - meta.origin[2]) / meta.voxelSizeMpc,
  ];
  const inBounds =
    voxel[0] >= 0 &&
    voxel[0] < meta.n &&
    voxel[1] >= 0 &&
    voxel[1] < meta.n &&
    voxel[2] >= 0 &&
    voxel[2] < meta.n;
  return { voxel, inBounds };
}
