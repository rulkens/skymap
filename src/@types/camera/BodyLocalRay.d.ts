import type { Vec3 } from '../math/Vec3';

/** A pick/cast ray in body-fixed metres: origin + unit direction. */
export type BodyLocalRay = { readonly originM: Vec3; readonly dir: Vec3 };
