import { describe, expect, it } from 'vitest';

import { milkyWayVisibility } from '../../../src/layers/milkyWay/visibility';
import { bandValueOf } from '../../../src/services/engine/presentation/bandValueOf';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { smoothstep } from '../../../src/utils/math/smoothstep';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const KPC = SCALE_UNITS.KPC_TO_MPC;
const bodyStates = deriveBodyStates(CONST_J2000);
const GC = bodyStates.get('galactic-centre')!.positionMpc;
const disk = milkyWayVisibility[0];

function viewAt(drawCamPos: Vec3): FrameView {
  return { drawCamPos, snapshot: { bodyStates } } as unknown as FrameView;
}

describe('milkyWayDisk approach bands', () => {
  it("the disk's two approach bands multiply", () => {
    // 1 kpc from the Sun, directly away from the Centre: both terms are below 1, so the
    // product sits under the min the disk used to take.
    const r0 = Math.hypot(...GC);
    const cam = GC.map((c) => (-c / r0) * KPC) as unknown as Vec3;
    const gcDist = Math.hypot(cam[0] - GC[0], cam[1] - GC[1], cam[2] - GC[2]);
    const sun = smoothstep(0.0002, 0.002, KPC);
    const centre = smoothstep(0.0006, 0.012, gcDist);
    expect(bandValueOf(disk, undefined, viewAt(cam))).toBeCloseTo(sun * centre, 9);
    expect(sun * centre).toBeLessThan(Math.min(sun, centre));
  });

  it('is gone within 200 pc of the Sun and within 600 pc of Sgr A*', () => {
    expect(bandValueOf(disk, undefined, viewAt([0.0002, 0, 0]))).toBe(0);
    expect(bandValueOf(disk, undefined, viewAt([GC[0] + 0.0006, GC[1], GC[2]]))).toBe(0);
  });
});
