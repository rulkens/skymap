import { describe, expect, it } from 'vitest';

import { shotPose } from '../../../../tools/utils/capture/shotPose';
import { bodyPhasePose } from '../../../../tools/utils/capture/bodyPhasePose';
import { DEFAULT_FOV_DEG } from '../../../../src/data/defaults';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { SceneShot } from '../../../../tools/utils/capture/SceneShot';

const T = '2026-09-18T12:00:00Z';
const POSE: CameraPose = { target: [1, 2, 3], yaw: 0.4, pitch: -0.2, distance: 5e-22 };

const shot = (extra: Partial<SceneShot>): SceneShot => ({
  focusId: 'body-jupiter',
  t: T,
  outPath: 'out.webp',
  label: 'jupiter',
  ...extra,
});

describe('shotPose', () => {
  it('returns an explicit pose untouched', () => {
    expect(shotPose(shot({ pose: POSE }))).toBe(POSE);
  });

  it('has no pose when the shot asks for neither', () => {
    expect(shotPose(shot({}))).toBeUndefined();
  });

  it('frames a phase shot at the app default field of view', () => {
    // The distance is derived from the fov, so a shot framed at any other one
    // lands the body at the wrong apparent size — silently, in every thumbnail.
    const fovYRad = (DEFAULT_FOV_DEG * Math.PI) / 180;
    expect(shotPose(shot({ phaseDeg: 315 }))).toEqual(
      bodyPhasePose('body-jupiter', T, 315, fovYRad),
    );
  });

  it('refuses a shot that sets both', () => {
    expect(() => shotPose(shot({ pose: POSE, phaseDeg: 315 }))).toThrow(/sets both/);
  });
});
