import { describe, it, expect } from 'vitest';

import { framingPose } from '../../../../src/services/engine/camera/framingPose';
import { focusFraming } from '../../../../src/services/engine/camera/focusFraming';
import { bodyDriverGeometry } from '../../../../src/utils/scene/bodyDriverGeometry';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const MARS_ROW: SelectionRow = {
  type: 'body',
  id: 'mars',
  label: 'Mars',
  positionMpc: [1e-6, 2e-6, 3e-6],
  driver: { ...bodyDriverGeometry('mars'), focusDistanceRadii: 7 },
};

describe('framingPose', () => {
  it('framingPose keeps yaw and pitch of from and takes target and distance from focusFraming', () => {
    const from: CameraPose = { target: [9, 9, 9], yaw: 0.4, pitch: -0.2, distance: 500, roll: 0.3 };
    const framing = focusFraming(MARS_ROW, 0.8);

    expect(framingPose(MARS_ROW, 0.8, from)).toEqual({
      target: framing.target,
      yaw: 0.4,
      pitch: -0.2,
      distance: framing.distance,
    });
  });
});
