import type { Vec3 } from '../math/Vec3';

/** SampledBody — a craft driven by a loaded track; `trailColor` is its trail tint (linear HDR). */
export type SampledBody = { readonly id: string; readonly trailColor: Vec3 };
