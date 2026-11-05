/**
 * phobosOrbit — a close orbit of Phobos's shape model that ends with Mars
 * behind it, then a pull-back that shows the moon against the planet.
 *
 * The orbit sweeps INTO the Mars-behind framing rather than out of it, so the
 * pull-back starts on the composed shot. Instant-dependent like `earthFlyout`:
 * both bodies are read at the frozen clip-start instant.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { dollyTo, hide, hold, spin, wait } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../scaleUnits';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';

const PHOBOS_ID = asSceneBodyId('phobos');
const MARS_ID = asSceneBodyId('mars');

// Phobos is ~27 × 22 × 18 km, so 45 km fills about half the frame.
const CLOSE_MPC = 45 * SCALE_UNITS.KM_TO_MPC;
// Mars sits ~9,400 km past Phobos; from here both read, Phobos as a speck.
const FAR_MPC = 30_000 * SCALE_UNITS.KM_TO_MPC;
const SWEEP_RAD = 1.6; // enough to roll Stickney past the limb
const ELEVATION_RAD = 0.25;

export function phobosOrbit(simDays: number): Clip {
  const bodies = deriveBodyStates(simDays);
  const phobos = bodies.get(PHOBOS_ID)!.positionMpc;
  const mars = bodies.get(MARS_ID)!.positionMpc;
  const toMars = normalize3([mars[0] - phobos[0], mars[1] - phobos[1], mars[2] - phobos[2]]);
  const { yaw, pitch } = orbitAnglesLookingAlong(toMars, ORIENTATION_FRAMES.ecliptic);
  const target: Vec3 = [phobos[0], phobos[1], phobos[2]];

  return {
    id: 'phobosOrbit',
    label: 'Phobos close-up',
    data: {
      start: { target, distance: CLOSE_MPC, yaw: yaw + SWEEP_RAD, pitch: pitch + ELEVATION_RAD },
      timeline: [
        // Only Mars, Phobos and the rovers keep their names: star names crowd a close-up.
        hide(['label:starCatalog', 'label:famousGalaxy', 'label:structure', 'structureRing', 'missionTrails'], 0),
        wait(2), // the shape model streams in behind the lead-in
        spin('yaw', { by: -SWEEP_RAD, over: 16 }),
        dollyTo(FAR_MPC, 10, 'easeInOutSine'),
        hold(3),
      ],
    },
  };
}
