/**
 * The one reader of `AssetDemand`: a row's demand and release edges this pass. Object form:
 * demand = shown ∧ tier ∧ ((near-load ∧ size-load) ∨ lifted); release = ¬tier ∨ ¬shown ∨
 * (¬lifted ∧ (near-release ∨ size-release)). A throw here is caught by the loop's per-row
 * guard and skips that row's enqueue and drop edges too, so a declaration must never throw:
 * `assertAssetDemands` resolves every one at table build.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import { bandDistanceMpc } from '../presentation/bandDistanceMpc';
import { resolveAssetDemand } from './resolveAssetDemand';
import { visibilitySwitchOf } from '../../../utils/visibility/visibilitySwitchOf';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { subjectOccludedByBodies } from '../../../utils/occlusion/subjectOccludedByBodies';
import type { AssetDemandVerdict } from '../../../@types/loading/AssetDemandVerdict';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DeclaredDemand } from '../../../@types/loading/DeclaredDemand';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { DemandResolution } from '../../../@types/loading/DemandResolution';
import type { NearGate } from '../../../@types/loading/NearGate';
import type { SizeGate } from '../../../@types/loading/SizeGate';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

const NONE: readonly never[] = [];
const LOAD: AssetDemandVerdict = { demand: true, release: false };
const HOLD: AssetDemandVerdict = { demand: false, release: false };
const RELEASE: AssetDemandVerdict = { demand: false, release: true };

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

function nearVerdict(
  ctx: DemandCtx,
  near: NearGate | undefined,
  r: DemandResolution,
): AssetDemandVerdict {
  if (near === undefined || r.band === undefined) return LOAD;
  const d = bandDistanceMpc(r.band, ctx.cameraPosMpc, deriveBodyStates(ctx.simDays));
  return {
    demand: d >= r.inMpc / near.lead && d <= r.outMpc * near.lead,
    release: d < r.inMpc / near.release || d > r.outMpc * near.release,
  };
}

// Presence and the horizon only hold a load back, never release: a craft's pre-launch
// position is parked inside Earth, and a site dipping behind its host stays resident.
function sizeVerdict(
  ctx: DemandCtx,
  size: SizeGate | undefined,
  r: DemandResolution,
): AssetDemandVerdict {
  if (size === undefined) return LOAD;
  // Before the first frame nothing has drawn, and distance 0 would read as Infinity px.
  if (!(ctx.drawPxPerRad > 0)) return HOLD;
  const states = deriveBodyStates(ctx.simDays);
  const positionMpc = states.get(size.body)?.positionMpc;
  if (positionMpc === undefined) return RELEASE;
  const camPosMpc = ctx.cameraPosMpc;
  const px = bodyApparentDiameterPx({
    positionMpc,
    radiusM: r.sizeRadiusM,
    camPosMpc,
    pxPerRad: ctx.drawPxPerRad,
  });
  if (px < size.loadPx) return px < size.releasePx ? RELEASE : HOLD;
  if (!spacecraftPresent(size.body, ctx.simDays)) return HOLD;
  const siteHost = r.siteHost;
  if (siteHost === undefined) return LOAD;
  const host = states.get(siteHost.id);
  if (host === undefined) return RELEASE;
  const bodies = [{ positionMpc: host.positionMpc, radiusM: siteHost.radiusM }];
  return subjectOccludedByBodies({ subjectMpc: positionMpc, camPosMpc, bodies }) ? HOLD : LOAD;
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
  if (!tierOk || !isShown(ctx, r)) return RELEASE;
  const near = nearVerdict(ctx, demand.near, r);
  const size = sizeVerdict(ctx, demand.size, r);
  const lifted = isLifted(ctx, demand, r);
  return {
    demand: (near.demand && size.demand) || lifted,
    release: !lifted && (near.release || size.release),
  };
}
