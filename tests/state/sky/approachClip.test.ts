/**
 * approachClip — a far entry (a place, typed coordinates) must compile from wherever the camera
 * is, and end straight over the spot above the outer relief bound, where the arms take over.
 */
import { describe, it, expect } from 'vitest';

import { approachClip } from '../../../src/state/sky/approachClip';
import { compileClip } from '../../../src/services/engine/animation/compileClip';
import { evaluateFramedClip } from '../../../src/services/engine/camera/clips/evaluateClip';
import { foldToWorld } from '../../../src/services/engine/camera/arms/foldToWorld';
import { toBodyArm } from '../../../src/services/engine/camera/arms/body/poseFrameConversion';
import { hostOrThrow } from '../../../src/services/engine/camera/arms/hostOrThrow';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { bodyFixedEyeM } from '../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { surfacePointBodyFixed } from '../../../src/utils/geo/surfacePointBodyFixed';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { radToDeg } from '../../../src/utils/math/radToDeg';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { ARRIVAL_APPROACH_SEC } from '../../../src/data/sky/arrivalApproachSec';
import { ARRIVAL_APPROACH_ALT_M } from '../../../src/data/sky/arrivalApproachAltM';
import type { CameraPose } from '../../../src/@types/camera/pose/CameraPose';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';

const EARTH = asSceneBodyId('earth');
const B = ORIENTATION_FRAMES.ecliptic;
const bodies = deriveBodyStates(CONST_J2000);
const ctx = { bodies, poseBasis: B, upBasis: B, terrainHeightAt: datumOnlyTerrainHeight };
const PARIS: SkySpot = { body: EARTH, lonRad: 0.041, latRad: 0.8527 };
const SONDERMARKEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };

const DEEP_SPACE: CameraPose = { target: [0, 0, 0], yaw: 0.4, pitch: 0.2, distance: 1e-3 };
const STANDING = foldToWorld(
  { frame: { sky: SONDERMARKEN }, pose: { azimuthRad: 1, altitudeRad: 0.3 } },
  ctx,
);

describe('approachClip', () => {
  it.each([
    ['deep space', DEEP_SPACE],
    ['standing elsewhere', STANDING],
  ])('from %s compiles and ends straight over the spot above the outer bound', (_, start) => {
    const clip = approachClip(start, PARIS, 1, 0.8, ctx);
    expect(() => compileClip(clip, B)).not.toThrow();

    const end = evaluateFramedClip(clip, ARRIVAL_APPROACH_SEC, { bodies, frameBasis: B });
    const host = hostOrThrow({ body: EARTH }, ctx);
    expect(end.frame).toBe('absolute');
    const arm = toBodyArm(end.channels, B, B, EARTH, host.state);
    const want = surfacePointBodyFixed(
      radToDeg(PARIS.latRad),
      radToDeg(PARIS.lonRad),
      host.outerBoundRadiusM + ARRIVAL_APPROACH_ALT_M,
    );
    const eye = bodyFixedEyeM(arm);
    expect(Math.hypot(eye[0] - want[0], eye[1] - want[1], eye[2] - want[2])).toBeLessThan(1);
    // Looking straight down: forward is the spot's inward radial.
    const down = want.map((v) => -v / Math.hypot(...want));
    for (const i of [0, 1, 2]) expect(arm.basisLocal[6 + i]).toBeCloseTo(down[i]!, 6);
  });
});
