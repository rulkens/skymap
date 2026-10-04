import { describe, it, expect } from 'vitest';

import { nudgedSitePose } from '../../../src/utils/camera/nudgedSitePose';
import { steppedSitePose } from '../../../src/utils/camera/steppedSitePose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { MeshBody } from '../../../src/@types/scene/MeshBody';
import type { SitePose } from '../../../src/@types/camera/SitePose';

const ROVER: MeshBody = {
  id: 'fixture-rover',
  label: 'Fixture rover',
  boundingRadiusM: 2.479,
  albedo: [1, 1, 1],
  meshKey: 'fixture',
  standoffRadii: 2,
};
const VIEWPORT = [800, 600] as const;
const FOV = 0.8;
const POSE: SitePose = {
  siteId: 'fixture-rover' as BodyId,
  headingRad: 0,
  elevationRad: 0.4,
  rangeM: 50,
};

describe('nudgedSitePose', () => {
  it('site nudge ignores look and roll by reference', () => {
    expect(nudgedSitePose(POSE, { look: [0.1, 0.2], roll: 0.3 }, ROVER, VIEWPORT, FOV)).toBe(POSE);
  });

  it('site nudge orbit equals the equivalent drag', () => {
    const [dx, dy] = [12, -7];
    const dragged = steppedSitePose(
      POSE,
      { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [100 + dx, 100 + dy] },
      ROVER,
      VIEWPORT,
      FOV,
    );
    const k = FOV / VIEWPORT[1];
    const nudged = nudgedSitePose(POSE, { orbit: [dx * k, dy * k] }, ROVER, VIEWPORT, FOV);
    expect(Math.abs(nudged.headingRad - dragged.headingRad)).toBeLessThan(1e-12);
    expect(Math.abs(nudged.elevationRad - dragged.elevationRad)).toBeLessThan(1e-12);
    expect(nudged.rangeM).toBe(dragged.rangeM);
  });
});
