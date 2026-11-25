/**
 * watchCatalogSaga — the single owner of "what points feed the sim" and their
 * agent weights. Triggers: the catalog-identity writes (sources, tier, the
 * loaded file and its toggle), and `sagaContextRegistered` for the very first
 * load. `takeLatest` cancels an in-flight fetch the instant a newer trigger
 * lands for free — a superseded fetch's `catalogLoaded` never fires, because
 * the generator that would `put` it is already dead. WHERE points come from is
 * `resolveCatalogPointsPlan`, below, pulled out so the decision is
 * unit-testable without a fetch, a DOM `location`, or a running saga.
 */
import { takeLatest, put, select, call } from 'typed-redux-saga';

import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import type { UserCatalog } from '../../../@types/UserCatalog';
import type { UserFileProvenance } from '../../../@types/UserFileProvenance';
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
      readonly userCatalog: UserCatalog | null;
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
  const userCatalog = catalog.userCatalogOn ? catalog.userCatalog : null;
  return { kind: 'load', sources: catalog.sources, tier: catalog.tier, userCatalog };
}

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

function* loadCatalogWorker() {
  try {
    const catalog = yield* select((s: RootState) => s.catalog);
    const plan = resolveCatalogPointsPlan(catalog, hasUrlGate('probe'));
    const points = yield* resolvePoints(plan);
    const weights = deriveAgentWeights(points.weight, catalog.weightMode);
    const bounds = points.count > 0 ? catalogBounds(points.positions) : null;
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
