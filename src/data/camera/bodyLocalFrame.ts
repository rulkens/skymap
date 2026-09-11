import type { Vec3 } from '../../@types/math/Vec3';

/** Body-fixed origin and pole — `[0,0,0]` is the body centre (ruled, S2). */
export const BODY_LOCAL_FRAME: { readonly centreM: Vec3; readonly pole: Vec3 } = {
  centreM: [0, 0, 0],
  pole: [0, 0, 1],
};
