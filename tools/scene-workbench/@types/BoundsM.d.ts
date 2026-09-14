import type { Vec3 } from '../../../src/@types/math/Vec3';

/** An axis-aligned box in a group's local frame — ENU, +Z up, metres. */
export type BoundsM = { readonly min: Vec3; readonly max: Vec3 };
