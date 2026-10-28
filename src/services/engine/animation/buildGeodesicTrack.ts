/**
 * buildGeodesicTrack — compile a `geodesic` effect into a `CompositeTrack` over
 * `target` + `distance`, sibling to `buildPathTrack`. The geometry and the unit
 * contract live in `geodesicPath`; this adds the clip's timing. Yaw and pitch
 * are not declared: they stay independent base tweens beside the move (spec §2.5).
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CompositeSample } from '../../../@types/animation/compiledClip/CompositeSample';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';
import type { GeodesicTuning } from '../../../@types/camera/GeodesicTuning';
import type { Vec3 } from '../../../@types/math/Vec3';
import { geodesicPath } from '../../../utils/camera/geodesicPath';
import { EASE } from './ease';

const GEODESIC_CHANNELS: readonly (keyof CompositeSample)[] = ['target', 'distance'];

export function buildGeodesicTrack(p: {
  readonly start: CameraPose;
  readonly startSec: number;
  readonly to: { readonly target: Vec3; readonly distance: number };
  readonly tuning: GeodesicTuning;
  readonly fovYRad: number;
  /** Seconds; omitted ⇒ the arc-length duration. */
  readonly over?: number;
}): CompositeTrack {
  const path = geodesicPath(
    { target: p.start.target, distance: p.start.distance },
    p.to,
    p.fovYRad,
    p.tuning,
  );
  const durationSec = p.over ?? path.durationMs / 1000;
  const ease = EASE[p.tuning.ease];

  return {
    startSec: p.startSec,
    endSec: p.startSec + durationSec,
    channels: GEODESIC_CHANNELS,
    sample: (localSec) => path.at(ease(durationSec > 0 ? localSec / durationSec : 1)),
  };
}
