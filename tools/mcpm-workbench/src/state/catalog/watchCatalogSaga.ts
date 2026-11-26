/**
 * watchCatalogSaga — the single owner of "what points feed the sim" and their
 * agent weights. Triggers: the catalog-identity writes (sources, tier, the
 * loaded file and its toggle), and `sagaContextRegistered` for the very first
 * load. `takeLatest` cancels an in-flight fetch the instant a newer trigger
 * lands for free — a superseded fetch's `catalogLoaded` never fires, because
 * the generator that would `put` it is already dead. WHERE points come from is
 * `resolveCatalogPointsPlan` (src/catalog/), pulled out so the decision is
 * unit-testable without a fetch, a DOM `location`, or a running saga. A load
 * from the dialog fits the box here when Auto fit is on, and frames the camera
 * on that box (or on the file, when the box stays), in the same synchronous run
 * as `catalogLoaded`: watchSceneSaga's debounce folds them into one build.
 */
import type { Action } from '@reduxjs/toolkit';
import { takeLatest, put, select, call } from 'typed-redux-saga';

import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import type { CatalogPointsPlan } from '../../../@types/catalog/CatalogPointsPlan';
import type { GridSlice } from '../../../@types/grid/GridSlice';
import type { UserCatalogLoad } from '../../../@types/catalog/UserCatalogLoad';
import type { UserFileProvenance } from '../../../@types/catalog/UserFileProvenance';
import { catalogBounds } from '../../catalog/catalogBounds';
import { concatCatalogPoints } from '../../catalog/concatCatalogPoints';
import { deriveAgentWeights } from '../../catalog/weights/deriveAgentWeights';
import { deriveGridBox } from '../../grid/deriveGridBox';
import { loadCatalogPoints } from '../../catalog/loadCatalogPoints';
import { syntheticCatalog } from '../../catalog/syntheticCatalog';
import { sagaContextRegistered } from '../../store/sagaContextRegistered';
import { fitBoxToCatalog } from '../grid/gridSlice';
import { framingCameraPose } from '../view/framingCameraPose';
import { commitCameraPose } from '../view/viewSlice';
import type { RootState } from '../../store/types';
import {
  catalogLoaded,
  setCatalogBuildError,
  setCatalogSources,
  setCatalogTier,
  setUserCatalogOn,
  userCatalogLoaded,
} from './catalogSlice';
import { resolveCatalogPointsPlan } from '../../catalog/resolveCatalogPointsPlan';

function* resolvePoints(plan: CatalogPointsPlan) {
  if (plan.kind === 'synthetic') return syntheticCatalog();
  const builtIn = yield* call(loadCatalogPoints, plan.sources, plan.tier);
  return plan.userCatalog ? concatCatalogPoints([builtIn, plan.userCatalog.points]) : builtIn;
}

function userFileOf(plan: CatalogPointsPlan): UserFileProvenance | null {
  if (plan.kind === 'synthetic' || !plan.userCatalog) return null;
  const { fileName, settings, points } = plan.userCatalog;
  return { fileName, settings, nPoints: points.count };
}

/** The fitted box when Auto fit moved it; else the file, which the box may not hold. */
function loadFraming(load: UserCatalogLoad, grid: GridSlice) {
  if (load.fitBounds) return framingCameraPose(deriveGridBox(grid));
  const { points } = load.catalog;
  if (points.count === 0) return null;
  const { min, max } = catalogBounds(points.positions);
  return framingCameraPose({
    centerMpc: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    sizeMpc: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  });
}

function* loadCatalogWorker(trigger: Action) {
  try {
    const catalog = yield* select((s: RootState) => s.catalog);
    const plan = resolveCatalogPointsPlan(catalog, hasUrlGate('probe'));
    const points = yield* resolvePoints(plan);
    const weights = deriveAgentWeights(points.weight, catalog.weightMode);
    const bounds = points.count > 0 ? catalogBounds(points.positions) : null;
    const load = userCatalogLoaded.match(trigger) ? trigger.payload : null;
    if (load?.fitBounds) {
      const agentCount = yield* select((s: RootState) => s.sim.agentCount);
      const lanes = { agentCount, pointCount: points.count };
      yield* put(fitBoxToCatalog({ bounds: load.fitBounds, lanes }));
    }
    const pose = load && loadFraming(load, yield* select((s: RootState) => s.grid));
    if (pose) yield* put(commitCameraPose(pose));
    yield* put(catalogLoaded({ points, weights, bounds, userFile: userFileOf(plan) }));
  } catch (err) {
    // A fetch failure must not kill this watcher (or, via takeLatest's shared
    // root, every OTHER saga in the tree) — surface it the same way a harness
    // build refusal does, and stay alive for the next trigger.
    yield* put(setCatalogBuildError((err as Error).message));
  }
}

export function* watchCatalogSaga() {
  yield* takeLatest(
    [setCatalogSources, setCatalogTier, userCatalogLoaded, setUserCatalogOn, sagaContextRegistered],
    loadCatalogWorker,
  );
}
