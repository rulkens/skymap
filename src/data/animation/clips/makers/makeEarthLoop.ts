/**
 * makeEarthLoop — shared builder for the forever-looping "Earth ⇄ out and
 * back" clips: open on Earth's sunlit side, dolly out to `farDistanceMpc`,
 * hold, dolly back, hold, repeat. `loop: true` (see `ClipData`) hands the
 * repeat to `clipPlayer`; this builder's only job is to make the loop point
 * invisible: identical start/end pose, yaw offset by exactly one full turn.
 * Instant-dependent factory shape as `earthFlyout` (see its header): Earth's
 * position is a function of the clock, frozen at clip start.
 */

import type { Clip } from '../../../../@types/animation/Clip';
import type { ClipId } from '../../../../@types/animation/ClipId';
import type { Ease } from '../../../../@types/animation/Ease';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { dollyTo, spin, all, seq, hold, hide } from '../../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../../orientation/orientationFrames';
import { SCENE_EARTH } from '../../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../../scaleUnits';

const FLIGHT_SEC = 70; // default one-leg pull-back window, same as earthFlyout
const HOLD_SEC = 4;

const EARTH_RADIUS_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
const START_DISTANCE_MPC = EARTH_RADIUS_MPC * 3;

// Lift out of the ecliptic. Aiming straight along the sunward direction puts
// the eye IN the plane every planetary orbit lies in, so the orbits collapse to
// edge-on lines for the whole first half of the pull-back. 30° reads them as
// ellipses without tilting far enough to lose the sunlit face.
const ELEVATION_RAD = (30 * Math.PI) / 180;

export function makeEarthLoop(opts: {
  id: ClipId;
  label: string;
  farDistanceMpc: number;
  hideLabels?: boolean;
  /**
   * Optional multi-leg outbound path (must end at `farDistanceMpc`); the
   * return leg mirrors it. Lets a clip crawl through a scale band — dolly
   * tweens in LOG space, so a leg's pace is its decades-per-second. Omitted:
   * one eased leg over FLIGHT_SEC.
   */
  outbound?: { toMpc: number; sec: number; ease?: Ease }[];
}): (simDays: number) => Clip {
  const { id, label, farDistanceMpc, hideLabels } = opts;
  const outbound = opts.outbound ?? [
    { toMpc: farDistanceMpc, sec: FLIGHT_SEC, ease: 'easeInOutCubic' as Ease },
  ];
  const flightSec = outbound.reduce((s, leg) => s + leg.sec, 0);
  const totalSec = flightSec * 2 + HOLD_SEC * 2;
  return function build(simDays: number): Clip {
    const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
    const target: Vec3 = [earth[0], earth[1], earth[2]];

    // The Sun sits at the render origin (see earthHomePose), so `earth` itself
    // IS the sun→Earth direction once normalised — aiming along it looks at Earth's day side.
    const sMag = Math.hypot(earth[0], earth[1], earth[2]);
    const sunward: Vec3 = [earth[0] / sMag, earth[1] / sMag, earth[2] / sMag];

    // Encoded under the ecliptic basis — the default orientation, and the frame
    // earthFlyout's own literal yaw/pitch are tuned against. A clip factory only
    // ever sees `simDays`, never the live frame, so (like earthFlyout) this pose
    // is exactly sunlit under the default orientation only — an existing
    // limitation of the `(simDays) => Clip` factory shape, not a new one.
    const { yaw, pitch } = orbitAnglesLookingAlong(sunward, ORIENTATION_FRAMES.ecliptic);

    return {
      id,
      label,
      data: {
        start: { target, distance: START_DISTANCE_MPC, yaw, pitch: pitch + ELEVATION_RAD },
        loop: true,
        timeline: [
          ...(hideLabels ? [hide(['labels'], 0)] : []),
          all([
            seq([
              ...outbound.map((leg) => dollyTo(leg.toMpc, leg.sec, leg.ease)),
              hold(HOLD_SEC),
              // Mirror of the outbound path: each leg returns to the distance
              // the corresponding outbound leg STARTED from, so the round trip
              // retraces itself and ends exactly at the start pose.
              ...outbound
                .map((leg, i) => ({
                  toMpc: i === 0 ? START_DISTANCE_MPC : outbound[i - 1]!.toMpc,
                  sec: leg.sec,
                  ease: leg.ease,
                }))
                .reverse()
                .map((leg) => dollyTo(leg.toMpc, leg.sec, leg.ease)),
              hold(HOLD_SEC),
            ]),
            // Exactly one full turn over the WHOLE cycle: yaw(totalSec) ===
            // yaw(0) + 2π, so the loop seam is bit-for-bit invisible (pinned by
            // the seamlessness test). Linear, not eased — a constant turn rate,
            // so nothing lurches at the seam.
            spin('yaw', { by: Math.PI * 2, over: totalSec, ease: 'linear' }),
          ]),
        ],
      },
    };
  };
}
