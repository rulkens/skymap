/**
 * A transient object the user focused: core places it each frame (`placeLiveSelection`), and the
 * camera poses from it and follows it as the clock moves, through the same runFrame loop a body
 * takes. Before the seam, an id with no body-table row threw inside the rungs on the first frame.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { updateSelectionFocus } from '../../../../src/state/selection/selectionSlice';
import { setSimDays } from '../../../../src/state/time/timeSlice';
import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { frameBodyStates } from '../../../../src/services/engine/frame/frameBodyStates';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { TransientBodyId } from '../../../../src/@types/scene/TransientBodyId';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
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

const REF: SelectionRef = { type: 'starCatalog', source: 0 as never, index: 0 };

const rowAt = (simDays: number): SelectionRow => ({
  type: 'starCatalog',
  source: 0 as never,
  index: 0,
  id: null,
  label: 'Test orbiter',
  positionMpc: orbiterAt(
    simDays,
    deriveBodyStates(simDays).get(asSceneBodyId('earth'))!.positionMpc,
  ),
  radiusM: 50,
  driver: {
    poseId: ID,
    boundingRadiusM: 50,
    footprintRadiusM: 50_000,
    groundRadiusM: null,
    standoffRadii: 2,
    followsSimClock: true,
    placedEachFrame: true,
  },
});

describe('following a transient object', () => {
  it('poses from it and keeps it as the target while the clock moves it', () => {
    const h = makeCameraSimHarness();
    h.state.selectionKindRows = [
      { type: 'starCatalog', extractRow: (_ref, simDays) => rowAt(simDays) } as SelectionKindRow,
    ];
    h.store.dispatch(updateSelectionFocus(REF, 'cut'));
    h.store.dispatch(setSelectionRow({ slot: 'focus', row: rowAt(CONST_J2000), focusId: null }));
    h.frame(120);

    // A quarter orbit later the object is 9,900 km from where it was focused.
    const later = CONST_J2000 + PERIOD_DAYS / 4;
    h.store.dispatch(setSimDays({ simDays: later, nowMs: h.nowMs() }));
    h.frame(120);

    expect(['followApproach', 'followHold']).toContain(h.state.cameraRuntime.register.winner);
    const bodies = frameBodyStates(h.store.getState(), h.state.selectionKindRows, later);
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
