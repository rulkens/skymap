import type { LonLatDeg } from '../scene/LonLatDeg';
import type { SceneBodyId } from '../scene/SceneBodyId';

/**
 * SampledBody — a craft driven by a loaded track.
 * Between `launchIso` and the track's first sample the craft rises from `launchPad` on Earth.
 */
export type SampledBody = {
  readonly id: SceneBodyId;
  readonly launchIso: string;
  readonly launchPad: LonLatDeg;
};
