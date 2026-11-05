import type { Vec3 } from '../math/Vec3';
import type { LonLatDeg } from '../scene/LonLatDeg';
import type { SceneBodyId } from '../scene/SceneBodyId';

/**
 * SampledBody — a craft driven by a loaded track; `trailColor` is its trail tint (linear HDR).
 * Between `launchIso` and the track's first sample the craft rises from `launchPad` on Earth.
 */
export type SampledBody = {
  readonly id: SceneBodyId;
  readonly trailColor: Vec3;
  readonly launchIso: string;
  readonly launchPad: LonLatDeg;
};
