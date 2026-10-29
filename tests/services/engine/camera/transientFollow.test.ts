/**
 * A transient object (`transientPositions`) the user focused: the camera poses from it and follows
 * it as the clock moves, through the same runFrame loop a body takes. Before the seam, an id with
 * no body-table row threw inside the rungs on the first frame.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { transientPositions } from '../../../../src/services/bodies/transientPositions';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { setSimDays } from '../../../../src/state/time/timeSlice';
import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { TransientBodyId } from '../../../../src/@types/scene/TransientBodyId';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ID: TransientBodyId = 'transient:test-orbiter';
const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const KM = SCALE_UNITS.KM_TO_MPC;
const ORBIT_KM = 7_000;
const PERIOD_DAYS = 100 / 1440;

// A circular equatorial orbit round Earth: where the object is, whatever Earth does.
const orbiterAt = (simDays: number, earth: Readonly<Vec3>): Vec3 => {
  const a = (2 * Math.PI * (simDays - CONST_J2000)) / PERIOD_DAYS;
  return [earth[0] + ORBIT_KM * KM * Math.cos(a), earth[1] + ORBIT_KM * KM * Math.sin(a), earth[2]];
};

afterEach(() => transientPositions.delete(ID));

describe('following a transient object', () => {
  it('poses from it and keeps it as the target while the clock moves it', () => {
    transientPositions.set(ID, (simDays, positions) =>
      orbiterAt(simDays, positions.get(asSceneBodyId('earth'))!),
    );
    const h = makeCameraSimHarness();
    const at = deriveBodyStates(CONST_J2000).get(ID)!.positionMpc;
    h.store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'starCatalog',
          source: 0 as never,
          index: 0,
          id: null,
          label: 'Test orbiter',
          positionMpc: [at[0], at[1], at[2]],
          radiusM: 50,
          driver: {
            poseId: ID,
            boundingRadiusM: 50,
            footprintRadiusM: 50_000,
            groundRadiusM: null,
            standoffRadii: 2,
            followsSimClock: true,
          },
        },
      }),
    );
    h.frame(120);

    // A quarter orbit later the object is 9,900 km from where it was focused.
    const later = CONST_J2000 + PERIOD_DAYS / 4;
    h.store.dispatch(setSimDays({ simDays: later, nowMs: h.nowMs() }));
    h.frame(120);

    expect(['followApproach', 'followHold']).toContain(h.state.cameraRuntime.register.winner);
    const bodies = deriveBodyStates(later);
    const world = foldToWorld(h.state.cameraRuntime.outputs.displayed, {
      bodies,
      poseBasis: B,
      upBasis: B,
      terrainHeightAt: datumOnlyTerrainHeight,
    });
    const now = bodies.get(ID)!.positionMpc;
    const missKm = Math.hypot(...([0, 1, 2] as const).map((i) => world.target[i] - now[i])) / KM;
    expect(missKm).toBeLessThan(1);
  });
});
