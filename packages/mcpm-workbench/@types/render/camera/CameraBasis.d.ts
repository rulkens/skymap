import type { Vec3 } from '../../../../shared/src/@types/math/Vec3';

/** An orthonormal right-handed frame: `forward` looks at the target, `up` is re-derived. */
export type CameraBasis = {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
};
