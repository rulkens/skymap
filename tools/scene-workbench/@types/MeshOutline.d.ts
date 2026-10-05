import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Mesh-local metres (before the asset transform). Open, CCW, ≥ 3 corners, simple. */
export type MeshOutline = { readonly formatVersion: 1; readonly ringM: readonly Vec2[] };
