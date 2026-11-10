import type { Vec3 } from '../../../../@types/math/Vec3';

/** One seeded star as the antique print stage reads it (`bodies/starPoints/vertexPrint.wesl`). */
export type PrintStar = {
  /** Camera-relative, subtracted in f64 before the f32 upload. */
  readonly posRelCamMpc: Readonly<Vec3>;
  readonly absMag: number;
  /** The star's catalog fade times its focus dim: below one half it does not print. */
  readonly fade: number;
};
