/**
 * watchCatalogSaga — the single owner of "what points feed the sim" and how
 * much stellar mass to weight them by. Triggers: the two catalog-identity
 * writes, a packed-catalog install, and `sagaContextRegistered` for the very
 * first load. `takeLatest` cancels an in-flight fetch the instant a newer
 * trigger lands for free — a superseded fetch's `catalogLoaded` never fires,
 * because the generator that would `put` it is already dead. WHERE points
 * come from is `resolveCatalogPointsPlan`, below, pulled out so the decision
 * is unit-testable without a fetch, a DOM `location`, or a running saga.
 */
import { takeLatest, put, select, call } from 'typed-redux-saga';

import type { SourceType } from '../../../../../src/@types/data/SourceType';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import type { CatalogPoints } from '../../../@types/CatalogPoints';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import { catalogBounds } from '../../field/catalogBounds';
import { deriveAgentWeights } from '../../field/deriveAgentWeights';
import { loadCatalogPoints } from '../../field/loadCatalogPoints';
import { syntheticCatalog } from '../../field/syntheticCatalog';
import { sagaContextRegistered } from '../../store/sagaContextRegistered';
import type { RootState } from '../../store/types';
import {
  catalogLoaded,
  setCatalogBuildError,
  setCatalogLoadStatus,
  setCatalogSources,
  setCatalogTier,
  setPackedCatalog,
} from '../slices/catalogSlice';

export type CatalogPointsPlan =
  | { readonly kind: 'packedOverride'; readonly points: CatalogPoints }
  | { readonly kind: 'synthetic' }
  | { readonly kind: 'network'; readonly sources: readonly SourceType[]; readonly tier: Tier };

/**
 * A dev-dropped packed catalog wins outright (sticky for the session, same as
 * `CatalogSlice.packedOverride`'s doc comment); otherwise `?probe`
 * (probeGpuErrors.ts) swaps in a deterministic in-tool catalog so the GPU
 * probe never touches the network or `public/data`; otherwise the real fetch.
 */
export function resolveCatalogPointsPlan(
  catalog: Pick<CatalogSlice, 'packedOverride' | 'sources' | 'tier'>,
  probeGate: boolean,
): CatalogPointsPlan {
  if (catalog.packedOverride) return { kind: 'packedOverride', points: catalog.packedOverride };
  if (probeGate) return { kind: 'synthetic' };
  return { kind: 'network', sources: catalog.sources, tier: catalog.tier };
}

function* resolvePoints(plan: CatalogPointsPlan) {
  if (plan.kind === 'packedOverride') return plan.points;
  if (plan.kind === 'synthetic') return syntheticCatalog();
  return yield* call(loadCatalogPoints, plan.sources, plan.tier);
}

function* loadCatalogWorker() {
  yield* put(setCatalogLoadStatus('loading'));
  try {
    const catalog = yield* select((s: RootState) => s.catalog);
    const plan = resolveCatalogPointsPlan(catalog, hasUrlGate('probe'));
    const points = yield* resolvePoints(plan);
    const weights = deriveAgentWeights(points.log10StellarMass, catalog.weightMode);
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
    [setCatalogSources, setCatalogTier, setPackedCatalog, sagaContextRegistered],
    loadCatalogWorker,
  );
}
