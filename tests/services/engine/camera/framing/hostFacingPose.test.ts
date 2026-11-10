/**
 * hostFacingPose — a moon's cold-link framing looks along host → moon, so the eye
 * sits on the host's side: the Moon's near side, whatever the phase.
 */

import { describe, expect, it } from 'vitest';
import { hostFacingPose } from '../../../../../src/services/engine/camera/framing/hostFacingPose';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { updatePosition } from '../../../../../src/utils/camera/orbitCamera/updatePosition';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { installAppSelectionKinds } from '../../../../support/installAppSelectionKinds';
import type { OrbitCamera } from '../../../../../src/@types/camera/orbitCamera/OrbitCamera';

installAppSelectionKinds();

const FOV = (Math.PI / 180) * 45;
const eyeOffset = (body: string, simDays: number) => {
  const pose = hostFacingPose(asSceneBodyId(body), simDays, FOV, ORIENTATION_FRAMES.ecliptic)!;
  const cam = {
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: 1,
    target: [0, 0, 0],
    poseBasis: ORIENTATION_FRAMES.ecliptic,
    position: [0, 0, 0],
  } as unknown as OrbitCamera;
  updatePosition(cam);
  return cam.position;
};

describe('hostFacingPose', () => {
  it.each([0, 3.7, 7.4, 11.1, 14.8, 20])('puts the Moon-eye on the Earth side (day %s)', (d) => {
    const days = CONST_J2000 + 9000 + d;
    const states = deriveBodyStates(days);
    const m = states.get(asSceneBodyId('moon'))!.positionMpc;
    const e = states.get(asSceneBodyId('earth'))!.positionMpc;
    const toEarth = [e[0] - m[0], e[1] - m[1], e[2] - m[2]] as const;
    const n = Math.hypot(toEarth[0], toEarth[1], toEarth[2]);
    const eye = eyeOffset('moon', days) as unknown as number[];
    const dot = (eye[0]! * toEarth[0] + eye[1]! * toEarth[1] + eye[2]! * toEarth[2]) / n;
    expect(dot).toBeCloseTo(1, 5);
  });

  it('is null for a body that orbits the Sun', () => {
    expect(
      hostFacingPose(asSceneBodyId('mars'), CONST_J2000, FOV, ORIENTATION_FRAMES.ecliptic),
    ).toBeNull();
  });
});
