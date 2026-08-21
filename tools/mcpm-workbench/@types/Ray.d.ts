import type { Vec3 } from '../../../src/@types/math/Vec3';

/** A world-space pick ray: `origin + t·dir`, `t ≥ 0`. `dir` is unit-length. */
export type Ray = { readonly origin: Readonly<Vec3>; readonly dir: Readonly<Vec3> };
