import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import {
  engineStatusChanged,
  engineSourceCountReported,
} from '../../../src/state/engine/engineSlice';
import { Source } from '../../../src/data/sources';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { cameraRoute } from '../../../src/store/constants';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { buildStarOctree } from '../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../src/data/starCatalog/starCatalogFormat';
import { resolveStarRecord } from '../../../src/services/engine/helpers/resolveStarRecord';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A live from-pose to seed the tween. The Milky-Way arm preserves yaw/pitch and
// targets a fixed distance, so the dispatched descriptor is fully determined by
// (ref type, from-pose) — no engine cloud needed for the milkyWay case.
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };

// The live star catalog the resolveDeps stub reads. Null until a test flips it,
// modelling the Gaia bin landing mid-flight — a star deep link's row is null
// until this is set. Reset per test in `beforeEach`.
let starCatalogStub: StarCatalog | null = null;

// resolveDeps stub — the milkyWay ref resolves without touching catalogs; the
// `stars` getter reads the live `starCatalogStub` so a test can bring the Gaia
// bin online between dispatches.
const resolveDeps = (): ResolveDeps =>
  ({
    catalogs: { get: () => undefined },
    famousGalaxiesMeta: undefined,
    structures: { byId: () => undefined },
    stars: { current: () => starCatalogStub },
  }) as unknown as ResolveDeps;

/** A small real star catalog through the octree + encode/decode path. */
async function makeStarCatalog(): Promise<StarCatalog> {
  const octree = buildStarOctree(
    [
      { mortonIndex: 0, offset: [3, 1, 2], absMag: 5, bpRp: 0.3 },
      { mortonIndex: 0, offset: [7, 8, 9], absMag: 4, bpRp: 0.5 },
    ],
    { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] },
  );
  return decodeStarCatalog(await encodeStarCatalog(octree));
}

describe('watchFocusTweenSaga', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => LiveCameraRuntime | null;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFocusTweenSaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, upBasisQuat: [0, 0, 0, 1] });
    mw.setContext({ resolveDeps, cameraRuntime: () => cameraRuntime() });
    return s;
  }
  beforeEach(() => {
    starCatalogStub = null;
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
  // catalogLoaded, which only fires after the camera exists.
  it('defers the tween when the camera is not ready, then plants it on the engine-ready pulse', async () => {
    cameraRuntime = () => null;
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // The camera comes online during wireInput; the engine then emits a status
    // pulse as the first catalog arrives (or the synthetic fallback fires).
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, upBasisQuat: [0, 0, 0, 1] });
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 1, source: Source.SDSS }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
  });

  // Regression: the star deep-link second gap. `resolveFocusId` resolves
  // `star-<n>` statically, so `updateSelectionFocus` fires at bootstrap — but
  // `extractSelectionRow`'s star arm returns null until the Gaia bin commits, so
  // the naive `row === null` early return dropped the focus forever. The saga
  // must instead defer on the per-source count report (dispatched the instant a
  // catalog commits) and re-extract once the star cloud lands.
  it('defers a star focus whose catalog has not loaded, then plants it once the bin commits', async () => {
    store.dispatch(updateSelectionFocus({ type: 'star', index: 1 }));
    await flush();
    // No catalog yet → row null → tween must not fire (and must not be dropped).
    expect(store.getState()[cameraRoute].tween).toBeNull();

    // The Gaia bin lands: the star slot uploads to the renderer, then reports its
    // count. By then `stars.current()` is non-null, so re-extraction succeeds.
    const catalog = await makeStarCatalog();
    starCatalogStub = catalog;
    store.dispatch(engineSourceCountReported({ source: Source.GaiaStars, count: 2 }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    // Framed on the resolved star's world position — the descriptor targets it.
    const record = resolveStarRecord(catalog, 1)!;
    expect(tween!.to.target).toEqual(record.positionMpc);
  });

  it('a star focus with a garbage index no-ops once the catalog is present (no infinite wait)', async () => {
    // A stale/out-of-range star index resolves to null even with the catalog
    // loaded. The deferral guard checks catalog presence, not row-ness, so this
    // exits rather than looping forever waiting for a report that never recurs.
    starCatalogStub = await makeStarCatalog();
    store.dispatch(updateSelectionFocus({ type: 'star', index: 999_999 }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('a null focus ref (release) resolves to no row → no tween', async () => {
    store.dispatch(updateSelectionFocus(null));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // A scene body is FOLLOWED by the camera's `followBody` driver, not tweened —
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
