/**
 * buildGlideTrack — compile a `glide` into a `CompositeTrack` over `target` +
 * `distance`, sibling to `buildPathTrack`. All the geometry and the unit
 * contract live in `glidePath`; this adds the clip's timing.
 *
 * `ease` reparametrises the arc WITHOUT deforming the path, so an overshoot
 * curve (`easeInOutBack`, `*Elastic`) walks the geodesic past its endpoint —
 * the camera flies through the target and back, and nothing throws.
 * Spec §2.4: docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Channel } from '../../../@types/animation/Channel';
import type { CompositeTrack } from '../../../@types/animation/CompiledClip';
import type { Ease } from '../../../@types/animation/Ease';
import type { Vec3 } from '../../../@types/math/Vec3';
import { glidePath } from '../../../utils/camera/glidePath';
import { DEFAULT_GLIDE_TUNING } from '../../../utils/camera/glideCalibration';
import { EASE } from './ease';

/** yaw and pitch are deliberately absent — angles are scale-free, so they stay
 *  independent scalar tweens beside the glide (spec §5.2). */
const GLIDE_CHANNELS: readonly Channel[] = ['target', 'distance'];

type BuildParams = {
  readonly start: CameraPose;
  readonly startSec: number;
  readonly to: { readonly target: Vec3; readonly distance: number };
  /** Omitted ⇒ the arc-length-derived duration. */
  readonly over?: number;
  readonly rho?: number;
  /** Omitted ⇒ `GLIDE_EASE_DEFAULT`, the one home for the arrival curve. */
  readonly ease?: Ease;
  readonly fovYRad: number;
};

export function buildGlideTrack(params: BuildParams): CompositeTrack {
  const { start, startSec, to, over, rho, ease, fovYRad } = params;

  const path = glidePath({ target: start.target, distance: start.distance }, to, fovYRad, { rho });
  const durationSec = over ?? path.durationSec;
  const easeFn = EASE[ease ?? DEFAULT_GLIDE_TUNING.ease];

  return {
    startSec,
    endSec: startSec + durationSec,
    channels: GLIDE_CHANNELS,
    sample: (localSec: number) => path.at(easeFn(durationSec > 0 ? localSec / durationSec : 1)),
  };
}
