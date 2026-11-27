import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

/** `incidence` is `ray·normal` at the hit — 0 is edge-on. */
export type SurfacePick = { readonly pointM: Vec3; readonly incidence: number };
