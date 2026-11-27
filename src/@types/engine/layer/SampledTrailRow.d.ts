import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { SceneBodyId } from '../../scene/SceneBodyId';

/** One body on a `sampled` position and its trail tint, in linear HDR. */
export type SampledTrailRow = { readonly id: SceneBodyId; readonly color: Vec3 };
