import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** Triangles on the unit globe: unit positions and triangle indices into them. */
export type SphericalMesh = { readonly positions: Vec3[]; readonly indices: number[] };
