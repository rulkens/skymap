import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import {
  engineStatusChanged,
  factsReported,
  layerFactsSeeded,
} from '../../../src/state/engine/engineSlice';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { cameraRoute, selectionRoute } from '../../../src/store/constants';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { structureSelectionRow } from '../../../src/layers/structure/present/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { starCatalogSelectionRow } from '../../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { Source } from '../../../src/data/sources';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { StarRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** The star Layer's row with no survey bin committed — its seeded arm needs none. */
const NO_SURVEY_STARS = {
  renderer: { loadedCatalogs: () => [][Symbol.iterator]() },
} as unknown as StarRowFixture;

const SIRIUS_REF = {
  type: 'starCatalog' as const,
  source: Source.FamousStar,
  index: SCENE_STARS.findIndex((star) => star.id === 'sirius'),
};

// A live from-pose to seed the tween. The Milky-Way arm preserves yaw/pitch and
// targets a fixed distance, so the dispatched descriptor is fully determined by
// (ref type, from-pose) — no engine cloud needed for the milkyWay case.
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };

// The live structure records the store stub reads, modelling
// `wireStructureProjection`'s anchors group landing mid-flight (Bug repro:
// #focus=cluster-virgo-m87 races the boot window). Reset per test.
let structureById: Record<string, StructureInfo> = {};

const structures: StructureRowFixture = {
  byId: (id: string) => structureById[id] ?? null,
  byCategory: () => [],
};

function structureRecord(id: string): StructureInfo {
  return {
    type: 'structure',
    category: 'galaxy-cluster',
    id,
    name: 'Virgo Cluster',
    worldPos: [4, 5, 6],
    featured: true,
    physicalRadiusMpc: 2.2,
  };
}

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
    mw.run(watchRequestFocusSaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, aspect: 16 / 9, upBasisQuat: [0, 0, 0, 1] });
    mw.setContext({
      selection: composeSelectionRows(
        () => [
          ...coreSelectionRows(),
          structureSelectionRow(structures),
          milkyWaySelectionRow(),
          starCatalogSelectionRow(NO_SURVEY_STARS),
        ],
        () => ALL_KINDS_ENABLED,
      ),
      cameraRuntime: () => cameraRuntime(),
    });
    return s;
  }
  beforeEach(() => {
    structureById = {};
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

  it('a cut focus request sets focus without starting a tween', async () => {
    store.dispatch(requestFocus({ id: MILKY_WAY_FOCUS_ID, transition: 'cut' }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'milkyWay' });
    expect(store.getState()[cameraRoute].tween).toBeNull();
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

  // A survey star's row needs its bin; with none committed the ref extracts to
  // nothing, so the tween must not fire (and must not throw on a null row).
  it('a survey-star focus with no bin loaded → no row, no tween', async () => {
    store.dispatch(
      updateSelectionFocus({ type: 'starCatalog', source: Source.GaiaStars, index: 1 }),
    );
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
    expect(sagaErrors).toEqual([]);
  });

  // A durable structure id resolves at bootstrap, before the store holds its
  // record; the wait is gated on `bulk === 'loading'`, the slot that will feed it.
  it('defers a structure focus whose store has not loaded, then plants it once the store is fed', async () => {
    store.dispatch(
      layerFactsSeeded({
        layer: 'structure',
        facts: { counts: {}, searchList: [], bulk: 'loading' },
      }),
    );
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-virgo-m87' }));
    await flush();
    // No structure store yet → row null → tween must not fire (and not be dropped).
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // The bulk group lands: the store is fed and the record resolves.
    structureById['cluster-virgo-m87'] = structureRecord('cluster-virgo-m87');
    store.dispatch(factsReported({ layer: 'structure', patch: { bulk: 'ready' } }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.target).toEqual([4, 5, 6]);
  });

  it('a structure focus with a garbage id no-ops once the store is loaded (no infinite wait)', async () => {
    // A stale/unknown structure id resolves to null even with the store fed.
    // The deferral guard checks the slot's status, not row-ness, so this exits
    // rather than looping forever waiting for a pulse that never recurs.
    store.dispatch(
      layerFactsSeeded({
        layer: 'structure',
        facts: { counts: {}, searchList: [], bulk: 'loading' },
      }),
    );
    store.dispatch(factsReported({ layer: 'structure', patch: { bulk: 'ready' } }));
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-does-not-exist' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // A saga still parked on the pulse would re-extract here and plant a tween.
    structureById['cluster-does-not-exist'] = structureRecord('cluster-does-not-exist');
    store.dispatch(factsReported({ layer: 'structure', patch: { bulk: 'ready' } }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // With no bulk category on, the slot is never demanded and sits 'idle';
  // waiting on it would hold the focus forever.
  it('a structure focus does not wait while the bulk slot is idle', async () => {
    store.dispatch(
      layerFactsSeeded({ layer: 'structure', facts: { counts: {}, searchList: [], bulk: 'idle' } }),
    );
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-virgo-m87' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    structureById['cluster-virgo-m87'] = structureRecord('cluster-virgo-m87');
    store.dispatch(factsReported({ layer: 'structure', patch: { bulk: 'ready' } }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // `factsReported` pulses for every Layer (galaxyCatalog republishes its
  // member count on each selection change), so the deferral must re-read
  // `bulk` rather than end on the first pulse.
  it("another Layer's facts report does not end a structure deferral", async () => {
    store.dispatch(
      layerFactsSeeded({
        layer: 'structure',
        facts: { counts: {}, searchList: [], bulk: 'loading' },
      }),
    );
    store.dispatch(
      layerFactsSeeded({ layer: 'galaxyCatalog', facts: { structureMemberCount: null } }),
    );
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-virgo-m87' }));
    await flush();

    store.dispatch(
      factsReported({ layer: 'galaxyCatalog', patch: { structureMemberCount: null } }),
    );
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    structureById['cluster-virgo-m87'] = structureRecord('cluster-virgo-m87');
    store.dispatch(factsReported({ layer: 'structure', patch: { bulk: 'ready' } }));
    await flush();
    expect(store.getState()[cameraRoute].tween!.to.target).toEqual([4, 5, 6]);
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

  // Regression: a famous star carries a driver id (its position comes from the
  // same table a planet's does) but does not MOVE, so the follow driver leaves it
  // and it must TWEEN rather than being swallowed by the body no-op. The saga
  // gates on the follow driver's own predicate (bodyMovesThisFrame), so a star
  // falls through to the tween. The PLANET half is the 'earth' case above.
  it('a famous-star focus DOES plant a tween (falls through the follow-membership gate)', async () => {
    // 'sirius' has no ORBITAL_ELEMENTS row, so the saga builds the tween; its `to`
    // is framed on the star's fixed world position (stars don't move).
    store.dispatch(updateSelectionFocus(SIRIUS_REF));
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
