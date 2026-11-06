/**
 * The one reader of `AssetDemand`: a row's demand and release edges this pass. Object form:
 * demand = shown ∧ tier ∧ (near-load ∨ lifted); release = ¬tier ∨ ¬shown ∨ (¬lifted ∧
 * near-release). It runs every frame over every row, so a declaration resolves once per
 * entries list and the verdicts are shared constants.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import { bandDistanceMpc } from '../presentation/bandDistanceMpc';
import { resolveAssetDemand } from './resolveAssetDemand';
import { visibilitySwitchOf } from '../../../utils/visibility/visibilitySwitchOf';
import type { AssetDemand } from '../../../@types/loading/AssetDemand';
import type { AssetDemandVerdict } from '../../../@types/loading/AssetDemandVerdict';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DeclaredDemand } from '../../../@types/loading/DeclaredDemand';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { DemandResolution } from '../../../@types/loading/DemandResolution';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

const LOAD: AssetDemandVerdict = { demand: true, release: false };
const HOLD: AssetDemandVerdict = { demand: false, release: false };
const RELEASE: AssetDemandVerdict = { demand: false, release: true };
const BOTH: AssetDemandVerdict = { demand: true, release: true };

const NONE: readonly never[] = [];

const resolutions = new WeakMap<readonly VisibilityEntry[], WeakMap<object, DemandResolution>>();

function verdictOf(demand: boolean, release: boolean): AssetDemandVerdict {
  if (demand) return release ? BOTH : LOAD;
  return release ? RELEASE : HOLD;
}

function resolutionOf(
  row: Pick<AssetWiringRow, 'gates'>,
  demand: DeclaredDemand,
  entries: readonly VisibilityEntry[],
): DemandResolution {
  let byRow = resolutions.get(entries);
  if (byRow === undefined) resolutions.set(entries, (byRow = new WeakMap()));
  let resolution = byRow.get(row);
  if (resolution === undefined) {
    byRow.set(row, (resolution = resolveAssetDemand(demand, row.gates, entries)));
  }
  return resolution;
}

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
  row: Pick<AssetWiringRow, 'gates'> & { readonly demand: AssetDemand },
  ctx: DemandCtx,
  entries: readonly VisibilityEntry[],
): AssetDemandVerdict {
  const demand = row.demand;
  if (demand === 'always') return LOAD;
  if (demand === 'whenSearching') return verdictOf(ctx.ui.paletteOpen, false);
  if ('companionOf' in demand)
    return verdictOf(ctx.slotState(demand.companionOf) !== 'idle', false);
  if ('fn' in demand) return verdictOf(demand.fn(ctx), demand.release?.(ctx) ?? false);

  const r = resolutionOf(row, demand, entries);
  const tierOk = demand.tiers === undefined || demand.tiers.includes(ctx.tier);
  if (!tierOk || !isShown(ctx, r)) return RELEASE;
  const near = demand.near;
  if (near === undefined) return LOAD;
  const d = bandDistanceMpc(r.band!, ctx.cameraPosMpc, deriveBodyStates(ctx.simDays));
  const e = r.edgeMpc;
  const nearLoad = near.edge === 'out' ? d <= e * near.lead : d >= e / near.lead;
  const nearRelease = near.edge === 'out' ? d > e * near.release : d < e / near.release;
  const lifted = isLifted(ctx, demand, r);
  return verdictOf(nearLoad || lifted, !lifted && nearRelease);
}
