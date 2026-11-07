/**
 * arrivalClip — the glide ends on the standing pose's own body-arm image, so the cut into the
 * zero-length sky leg is only the live ground's correction, never a drop from a range above it.
 */
import { describe, it, expect } from 'vitest';

import { arrivalClip } from '../../../src/state/sky/arrivalClip';
import { evaluateFramedClip } from '../../../src/services/engine/camera/clips/evaluateClip';
import { decodeBodyFixedChannels } from '../../../src/services/engine/camera/arms/body/utils/decodeBodyFixedChannels';
import { skyPoseToBodyArm } from '../../../src/services/engine/camera/arms/sky/utils/skyPoseToBodyArm';
import { toWorldArm } from '../../../src/services/engine/camera/arms/body/poseFrameConversion';
import { hostOrThrow } from '../../../src/services/engine/camera/arms/hostOrThrow';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { bodyFixedEyeM } from '../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { skySpotAt } from '../../../src/utils/geo/skySpotAt';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { ARRIVAL_GLIDE_SEC } from '../../../src/data/sky/arrivalGlideSec';
import { ARRIVAL_LOOK_UP_RAD } from '../../../src/data/sky/arrivalLookUpRad';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EARTH = asSceneBodyId('earth');
const B = ORIENTATION_FRAMES.ecliptic;
const bodies = deriveBodyStates(CONST_J2000);
const ctx = { bodies, poseBasis: B, upBasis: B, terrainHeightAt: datumOnlyTerrainHeight };
const HEADING = 1;

describe('arrivalClip', () => {
  it('a floor push at 30° depression glides onto the standing pose’s body-arm image', () => {
    const host = hostOrThrow({ body: EARTH }, ctx);
    const eyeSpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
    // 100 m up, looking 30° down along the heading: the ray meets the datum 200 m ahead.
    const eye = skyPoseToBodyArm(
      { azimuthRad: HEADING, altitudeRad: -Math.PI / 6 },
      eyeSpot,
      host.radiusM + 100,
    );
    const e = bodyFixedEyeM(eye);
    const f = eye.basisLocal;
    const point: Vec3 = [e[0] + f[6] * 200, e[1] + f[7] * 200, e[2] + f[8] * 200];
    const spot = skySpotAt(EARTH, point);
    const start = toWorldArm(
      eye,
      host.state,
      B,
      B,
      host.radiusM,
      host.standoffRadii,
      host.groundRadiusAtM,
    );

    const clip = arrivalClip(start, spot, point, HEADING, 0.8, ctx);
    const end = evaluateFramedClip(clip, ARRIVAL_GLIDE_SEC - 1e-6, {
      bodies,
      frameBasis: B,
      playback: {},
    });
    expect(end.frame).toEqual({ body: EARTH });
    const landed = decodeBodyFixedChannels(end.channels, EARTH);
    const want = skyPoseToBodyArm(
      { azimuthRad: HEADING, altitudeRad: ARRIVAL_LOOK_UP_RAD },
      spot,
      Math.hypot(...point),
    );
    const a = bodyFixedEyeM(landed);
    const b = bodyFixedEyeM(want);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1);
    for (let i = 0; i < 9; i++) {
      expect(Math.abs(landed.basisLocal[i]! - want.basisLocal[i]!)).toBeLessThan(1e-4);
    }
  });
});
