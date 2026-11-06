/**
 * The one reader of `AssetDemand`: a row's demand and release edges this pass. Object form:
 * demand = shown ∧ tier ∧ (near-load ∨ lifted); release = ¬tier ∨ ¬shown ∨ (¬lifted ∧
 * near-release). A throw here is caught by the loop's per-row guard and skips that row's
 * enqueue and drop edges too, so a declaration must never throw: `assertAssetDemands`
 * resolves every one at table build.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import { bandDistanceMpc } from '../presentation/bandDistanceMpc';
import { resolveAssetDemand } from './resolveAssetDemand';
import { visibilitySwitchOf } from '../../../utils/visibility/visibilitySwitchOf';
import type { AssetDemandVerdict } from '../../../@types/loading/AssetDemandVerdict';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DeclaredDemand } from '../../../@types/loading/DeclaredDemand';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { DemandResolution } from '../../../@types/loading/DemandResolution';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

const NONE: readonly never[] = [];

function isShown(ctx: DemandCtx, r: DemandResolution): boolean {
  for (const item of r.items) if (visibilitySwitchOf(ctx.settings, r.entry, item)) return true;
  if (r.label === undefined) return false;
  for (const item of r.labelItems) if (visibilitySwitchOf(ctx.settings, r.label, item)) return true;
  return false;
}

function isLifted(ctx: DemandCtx, demand: DeclaredDemand, r: DemandResolution): boolean {
  for (const lift of demand.alsoWhen ?? NONE) {
    if (lift === 'searching' && ctx.ui.paletteOpen) return true;
    if (lift === 'selected')
      for (const kind of r.selects ?? NONE) if (ctx.selectedKinds.has(kind)) return true;
  }
  return false;
}

export function evaluateAssetDemand(
  row: Pick<AssetWiringRow, 'demand' | 'gates'>,
  ctx: DemandCtx,
  entries: readonly VisibilityEntry[],
): AssetDemandVerdict {
  const demand = row.demand;
  if (demand === 'always') return { demand: true, release: false };
  if (demand === 'whenSearching') return { demand: ctx.ui.paletteOpen, release: false };
  if ('companionOf' in demand) {
    return { demand: ctx.slotState(demand.companionOf) !== 'idle', release: false };
  }
  if ('fn' in demand) return { demand: demand.fn(ctx), release: demand.release?.(ctx) ?? false };

  const r = resolveAssetDemand(demand, row.gates, entries);
  const tierOk = demand.tiers === undefined || demand.tiers.includes(ctx.tier);
  if (!tierOk || !isShown(ctx, r)) return { demand: false, release: true };
  const near = demand.near;
  if (near === undefined) return { demand: true, release: false };
  const d = bandDistanceMpc(r.band!, ctx.cameraPosMpc, deriveBodyStates(ctx.simDays));
  const e = r.edgeMpc;
  const nearLoad = near.edge === 'out' ? d <= e * near.lead : d >= e / near.lead;
  const nearRelease = near.edge === 'out' ? d > e * near.release : d < e / near.release;
  const lifted = isLifted(ctx, demand, r);
  return { demand: nearLoad || lifted, release: !lifted && nearRelease };
}
