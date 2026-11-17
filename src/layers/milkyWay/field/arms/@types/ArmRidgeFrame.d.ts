import type { Vec3 } from '../../../../../@types/math/Vec3';

export type ArmRidgeFrame = { readonly point: Vec3 } & {
  readonly along: Vec3;
  readonly across: Vec3;
  readonly pole: Vec3;
};
