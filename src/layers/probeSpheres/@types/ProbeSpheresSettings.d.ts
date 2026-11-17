import type { Vec3 } from '../../../@types/math/Vec3';
import type { ProbeSphereId } from './ProbeSphereId';

/** The section switch and one switch per sphere, then the material every sphere shares. */
export type ProbeSpheresSettings = {
  enabled: boolean;
  items: Record<ProbeSphereId, { enabled: boolean }>;
  /** Linear RGB, the shader's base colour factor. */
  color: Vec3;
  metallic: number;
  roughness: number;
};
