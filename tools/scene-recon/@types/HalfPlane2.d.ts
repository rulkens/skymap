import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Inside ⇔ `normal·p − offset ≥ 0`; `normal` is unit and points inward. */
export type HalfPlane2 = { readonly normal: Vec2; readonly offset: number };
