/**
 * makeSStarsClip — the S-stars around Sgr A* with the clock running years per
 * second, framed against S2's orbit: `tiltRad` 0 looks straight down its
 * normal (the ellipse undistorted), larger values lean toward edge-on.
 *
 * The orbit normal comes from two S2 positions a quarter period apart, read at
 * the clip-start instant; Sgr A* itself is the galactic-centre anchor, which
 * is not a moving body.
 */

import type { Clip } from '../../../../@types/animation/Clip';
import type { ClipId } from '../../../../@types/animation/ClipId';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  all,
  clock,
  dollyTo,
  hide,

  seq,
  spin,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../orientation/orientationFrames';
import { GALACTIC_CENTRE_ANCHOR } from '../../../places/galacticCentre';
import { SCALE_UNITS } from '../../../scaleUnits';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

const S2_ID = asSceneBodyId('s2');

const YEAR_DAYS = 365.25;

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function makeSStarsClip(opts: {
  id: ClipId;
  label: string;
  tiltRad: number;
  spinRad: number;
  /** Camera distance in AU: from, to, and the window of the dolly. */
  dolly: { fromAu: number; toAu: number; startSec: number; overSec: number };
  /** Sim years per second as [clip second, years since start] rows; must ascend. */
  years: [number, number][];
  durationSec: number;
  keepBulge?: boolean; // the disc's glow as context, for a shot that travels in from it
  hideField?: boolean; // the S-stars alone on black: the Gaia and named stars around them hidden
}): (simDays: number) => Clip {
  return function build(simDays: number): Clip {
    const centre = GALACTIC_CENTRE_ANCHOR.positionMpc;
    const r1 = sub(deriveBodyStates(simDays).get(S2_ID)!.positionMpc, centre);
    const r2 = sub(deriveBodyStates(simDays + 4 * YEAR_DAYS).get(S2_ID)!.positionMpc, centre);
    const normal = normalize3(cross(r1, r2));
    const inPlane = normalize3(r1);
    const c = Math.cos(opts.tiltRad);
    const s = Math.sin(opts.tiltRad);
    const forward = normalize3([
      -c * normal[0] + s * inPlane[0],
      -c * normal[1] + s * inPlane[1],
      -c * normal[2] + s * inPlane[2],
    ]);
    const AU = SCALE_UNITS.AU_TO_MPC;
    return {
      id: opts.id,
      label: opts.label,
      data: {
        start: {
          target: [centre[0], centre[1], centre[2]],
          distance: opts.dolly.fromAu * AU,
          ...orbitAnglesLookingAlong(forward, ORIENTATION_FRAMES.ecliptic),
        },
        timeline: [
          hide(
            [
              'survey',
              'structureRing',
              'labels',
              ...(opts.keepBulge ? [] : (['milkyWayDisk'] as const)),
              ...(opts.hideField ? (['starCatalog:gaiaStars', 'starCatalog:famousStar'] as const) : []),
            ],
            0,
          ),
          clock(opts.years.map(([sec, years]) => ({ sec, simDays: simDays + years * YEAR_DAYS }))),
          all([
            seq([
              wait(opts.dolly.startSec),
              dollyTo(opts.dolly.toAu * AU, opts.dolly.overSec, 'easeInOutSine'),
            ]),
            spin('yaw', { by: opts.spinRad, over: opts.durationSec, ease: 'linear' }),
          ]),
        ],
      },
    };
  };
}
