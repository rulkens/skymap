import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';

/** A box of whole bricks, brick coordinates; `hi` exclusive. */
export type BrickBox = { readonly lo: Vec3; readonly hi: Vec3 };
