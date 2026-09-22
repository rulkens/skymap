import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { applyUrlPose, clipStarted } from '../../../src/state/camera/cameraSlice';
import { selectUrlPose } from '../../../src/state/camera/selectors';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import {
  engineStatusChanged,
  engineStructureCountsChanged,
} from '../../../src/state/engine/engineSlice';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { cameraRoute } from '../../../src/store/constants';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A live from-pose to seed the tween. The Milky-Way arm preserves yaw/pitch and
// targets a fixed distance, so the dispatched descriptor is fully determined by
// (ref type, from-pose) — no engine cloud needed for the milkyWay case.
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };

// The live structure store the resolveDeps stub reads, modelling
// `wireStructureProjection`'s anchors group landing mid-flight (Bug repro:
// #focus=cluster-virgo-m87 races the boot window). Reset per test.
let structureById: Record<string, StructureInfo> = {};
let structuresLoadedStub = false;

// resolveDeps stub — the milkyWay ref resolves without touching catalogs; the
// `structures` getter reads the live stub above so a test can bring a
// catalog online between dispatches. No `stars` field: core no longer
// resolves the star kind at all (the starCatalog Layer's own selection row
// does, not exercised by this core-only saga fixture).
const resolveDeps = (): ResolveDeps =>
  ({
    structures: {
      byId: (id: string) => structureById[id] ?? null,
      byCategory: () => [],
      loaded: () => structuresLoadedStub,
    },
  }) as unknown as ResolveDeps;

describe('watchFocusTweenSaga', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => LiveCameraRuntime | null;
  // Captures any error the saga worker throws uncaught. redux-saga swallows an
  // unhandled worker error (no visible test failure, no console output) unless
  // something observes it — `onError` is that observation point, so a
  // regression that removes the ROW_FOCUSABLE filter shows up as a non-empty
  // array here rather than as a silently-still-null tween (see the
  // zoneOfAvoidance test below).
  let sagaErrors: unknown[];

  function build() {
    const mw = createSagaMiddleware({ onError: (error) => sagaErrors.push(error) });
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFocusTweenSaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, aspect: 16 / 9, upBasisQuat: [0, 0, 0, 1] });
    mw.setContext({
      resolveDeps,
      selection: composeSelectionRows(
        () => coreSelectionRows(resolveDeps),
        () => ALL_KINDS_ENABLED,
      ),
      cameraRuntime: () => cameraRuntime(),
    });
    return s;
  }
  beforeEach(() => {
    structureById = {};
    structuresLoadedStub = false;
    sagaErrors = [];
    store = build();
  });

  it('a focus ref change dispatches startCameraTween with the built descriptor', async () => {
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(tween!.to.yaw).toBe(FROM.yaw);
  });

  it('stands down when a #pose= link is pending, and spends the park — the link IS the destination', async () => {
    store.dispatch(applyUrlPose(absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 })));
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
    expect(selectUrlPose(store.getState())).toBeNull();

    // The park is spent, so a SECOND focus tweens normally rather than
    // standing down forever.
    store.dispatch(updateSelectionFocus({ type: 'body', id: 'sirius' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).not.toBeNull();
  });

  it('a select (non-focus) write does NOT start a tween', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('no-ops when the camera is not ready (cameraRuntime returns null)', async () => {
    cameraRuntime = () => null;
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // Regression: the body / milkyWay / star deep-link bug. A statically-
  // resolvable focus id dispatches updateSelectionFocus during engine bootstrap,
  // BEFORE initGpu has built state.cam — so cameraRuntime() is null. The tween
  // must not be silently dropped; it must fire once the engine emits its
  // readiness pulse (by when wireInput has installed the camera). Galaxy deep
  // links dodge this because their updateSelectionFocus is itself deferred on
  // the catalog-landed pulse, which only fires after the camera exists.
  it('defers the tween when the camera is not ready, then plants it on the engine-ready pulse', async () => {
    cameraRuntime = () => null;
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // The camera comes online during wireInput; the engine then emits a status
    // pulse as the first catalog arrives (or the synthetic fallback fires).
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, aspect: 16 / 9, upBasisQuat: [0, 0, 0, 1] });
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 1 }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
  });

  // The star kind's row is the starCatalog Layer's own now (Task 5 gives it
  // its own ref-stage deferral); this core-only saga fixture carries no star
  // row at all, so a star focus resolves to no row and the tween never fires.
  it('a star focus resolves to no row in the core-only composition → no tween', async () => {
    store.dispatch(updateSelectionFocus({ type: 'star', index: 1 }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // Regression: `#focus=cluster-virgo-m87` (a durable structure id) resolves
  // statically, so `updateSelectionFocus` fires at bootstrap — but
  // `structureSelectionRow`'s `extractRow` (`structures.byId`) returns null
  // until `wireStructureProjection`'s anchors group lands, which happens later
  // in the async bootstrap phase sequence than `setSagaContext`. Before this
  // fix the saga's deferral loop only covered `ref.type === 'star'`, so a
  // structure ref fell straight to the no-op and the camera never moved. The
  // saga must instead defer on `engineStructureCountsChanged` — the pulse
  // `wireStructureProjection` dispatches on every group change — and
  // re-extract once the store is fed.
  it('defers a structure focus whose store has not loaded, then plants it once the store is fed', async () => {
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-virgo-m87' }));
    await flush();
    // No structure store yet → row null → tween must not fire (and not be dropped).
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // The anchors group lands: the store is fed and the record resolves.
    structureById['cluster-virgo-m87'] = {
      type: 'structure',
      category: 'cluster',
      id: 'cluster-virgo-m87',
      name: 'Virgo Cluster',
      worldPos: [4, 5, 6],
      featured: true,
      physicalRadiusMpc: 2.2,
    };
    structuresLoadedStub = true;
    store.dispatch(engineStructureCountsChanged({ cluster: 1 }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.target).toEqual([4, 5, 6]);
  });

  it('a structure focus with a garbage id no-ops once the store is loaded (no infinite wait)', async () => {
    // A stale/unknown structure id resolves to null even with the store fed.
    // The deferral guard checks store presence, not row-ness, so this exits
    // rather than looping forever waiting for a pulse that never recurs.
    structuresLoadedStub = true;
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-does-not-exist' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('a null focus ref (release) resolves to no row → no tween', async () => {
    store.dispatch(updateSelectionFocus(null));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // A scene body is FOLLOWED by the camera's follow rows, not tweened —
  // the tween compiles fixed vec3 endpoints and cannot track a body the sim clock
  // moves. The saga must return before planting a tween for a body row, while a
  // non-body focus (here the Milky Way) still tweens as before.
  it('a body focus plants NO tween (the follow driver owns it); a non-body focus still does', async () => {
    // 'earth' resolves statically off SCENE_BODIES (no catalog needed).
    store.dispatch(updateSelectionFocus({ type: 'body', id: 'earth' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // A non-body focus (Milky Way) still plants a tween through the same saga.
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).not.toBeNull();
  });

  // Regression: famous stars are scene BODIES (star-body presence) but do not
  // move, so the follow driver leaves them and they must TWEEN rather than being
  // swallowed by the body no-op. The saga gates on the follow driver's own
  // predicate (bodyMovesThisFrame), so a star body falls through to the tween.
  // The PLANET-body-no-tween half is the 'earth' case above.
  it('a famous-star body focus DOES plant a tween (falls through the follow-membership gate)', async () => {
    // 'sirius' is a StarBody in SCENE_BODIES with no ORBITAL_ELEMENTS row, so the
    // saga builds the tween. Its `to` is framed on the star's fixed world position
    // (stars don't move → a tween is right).
    store.dispatch(updateSelectionFocus({ type: 'body', id: 'sirius' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).not.toBeNull();
  });

  // Regression: the zone-of-avoidance band has no x/y/z (a line-of-sight
  // effect, not a point), so `focusFraming`'s zoneOfAvoidance arm throws —
  // ROW_FOCUSABLE filters it out here, the ONE place every updateSelectionFocus
  // dispatch (including a future band double-click) funnels through. If this
  // filter is ever removed, this test fails against that throw instead of the
  // crash surfacing only once band picking makes the ref reachable.
  it('a zoneOfAvoidance focus is a silent no-op (no tween, no throw)', async () => {
    store.dispatch(updateSelectionFocus({ type: 'zoneOfAvoidance' }));
    await flush();
    // The tween staying null is necessary but not sufficient — it also stays
    // null if the worker crashed before reaching `put`. sagaErrors pins the
    // actual no-throw guarantee.
    expect(sagaErrors).toEqual([]);
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // A minimal clip payload: no camera motion, just timeline structure. The
  // timeline contents don't matter — what matters is that `camera.clip` is
  // non-null, which is what `selectClipActive` reads.
  const MINIMAL_CLIP: ClipData = { start: 'live', timeline: [] };

  it('watchFocusTweenSaga plants no tween while a clip is active', async () => {
    store.dispatch(clipStarted({ data: MINIMAL_CLIP, frame: DEFAULT_ORIENTATION }));
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('watchFocusTweenSaga plants a tween normally with no clip active', async () => {
    // Regression guard: `suspendDuringClip` must be transparent when no clip is active.
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(tween!.to.yaw).toBe(FROM.yaw);
  });

  // The descriptor must carry the orientation live AT DISPATCH TIME (not
  // DEFAULT_ORIENTATION, not whatever it later becomes) — the tween driver
  // re-expresses the pose against this pinned frame on a later switch.
  it('stamps the descriptor with settings.orientation live at dispatch time', async () => {
    store.dispatch(setOrientation('galactic'));
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween!.frame).toBe('galactic');
  });
});
