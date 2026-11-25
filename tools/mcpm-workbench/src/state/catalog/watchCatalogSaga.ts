/**
 * watchCatalogSaga — the single owner of "what points feed the sim" and how
 * much stellar mass to weight them by. Triggers: the catalog-identity
 * writes (sources, tier, the loaded file and its toggle), and
 * `sagaContextRegistered` for the very first load. `takeLatest` cancels an
 * in-flight fetch the instant a newer trigger lands for free — a superseded
 * fetch's `catalogLoaded` never fires, because the generator that would `put`
 * it is already dead. WHERE points
 * come from is `resolveCatalogPointsPlan`, below, pulled out so the decision
 * is unit-testable without a fetch, a DOM `location`, or a running saga.
 */
import { takeLatest, put, select, call } from 'typed-redux-saga';

import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import type { CatalogPoints } from '../../../@types/CatalogPoints';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import { catalogBounds } from '../../field/catalogBounds';
import { concatCatalogPoints } from '../../field/concatCatalogPoints';
import { deriveAgentWeights } from '../../field/deriveAgentWeights';
import { loadCatalogPoints } from '../../field/loadCatalogPoints';
import { syntheticCatalog } from '../../field/syntheticCatalog';
import { sagaContextRegistered } from '../../store/sagaContextRegistered';
import type { RootState } from '../../store/types';
import {
  catalogLoaded,
  setCatalogBuildError,
  setCatalogSources,
  setCatalogTier,
  setUserCatalogOn,
  userCatalogLoaded,
} from './catalogSlice';

export type CatalogPointsPlan =
  | { readonly kind: 'synthetic' }
  | {
      readonly kind: 'load';
      readonly sources: readonly GalaxyCatalogId[];
      readonly tier: Tier;
      readonly userPoints: CatalogPoints | null;
    };

/**
 * `?probe` (probeGpuErrors.ts) swaps in a deterministic in-tool catalog so the
 * GPU probe never touches the network or `public/data`; otherwise the switched-on
 * built-ins, plus the loaded file's points when it is on.
 */
export function resolveCatalogPointsPlan(
  catalog: Pick<CatalogSlice, 'userCatalog' | 'userCatalogOn' | 'sources' | 'tier'>,
  probeGate: boolean,
): CatalogPointsPlan {
  if (probeGate) return { kind: 'synthetic' };
  const userPoints = catalog.userCatalogOn ? (catalog.userCatalog?.points ?? null) : null;
  return { kind: 'load', sources: catalog.sources, tier: catalog.tier, userPoints };
}

function* resolvePoints(plan: CatalogPointsPlan) {
  if (plan.kind === 'synthetic') return syntheticCatalog();
  const builtIn = yield* call(loadCatalogPoints, plan.sources, plan.tier);
  return plan.userPoints ? concatCatalogPoints([builtIn, plan.userPoints]) : builtIn;
}

function* loadCatalogWorker() {
  try {
    const catalog = yield* select((s: RootState) => s.catalog);
    const plan = resolveCatalogPointsPlan(catalog, hasUrlGate('probe'));
    const points = yield* resolvePoints(plan);
    const weights = deriveAgentWeights(points.weight, catalog.weightMode);
    const bounds = points.count > 0 ? catalogBounds(points.positions) : null;
    yield* put(catalogLoaded({ points, weights, bounds }));
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
