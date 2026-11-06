/**
 * Resolves a declared demand against the composed entries and the scene: which switches count,
 * which label entry joins them, `near`'s band edges, `size`'s body and a site's host. Every way
 * a declaration can name nothing throws here, so `assertAssetDemands` catches it at table build
 * instead of the per-row guard swallowing it every frame.
 */

import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { positionDriverOrNull } from '../../../data/bodies/positionDrivers';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DeclaredDemand } from '../../../@types/loading/DeclaredDemand';
import type { DemandResolution } from '../../../@types/loading/DemandResolution';
import type { LabelEntry } from '../../../@types/engine/layer/LabelEntry';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

const OWN_SWITCH: readonly undefined[] = [undefined];
// Indexed: every size-gated row resolves its body each demand pass.
const SCENE_BODY_BY_ID = new Map(SCENE_BODIES.map((body) => [body.id as string, body]));

function assertItemsIn(
  items: readonly (string | undefined)[],
  entry: VisibilityEntry,
  address: string,
): void {
  for (const item of items) {
    const known = item === undefined ? entry.items === undefined : entry.items?.includes(item);
    if (!known) throw new Error(`'${address}' has no item '${String(item)}'`);
  }
}

export function resolveAssetDemand(
  demand: DeclaredDemand,
  gates: AssetWiringRow['gates'],
  entries: readonly VisibilityEntry[],
): DemandResolution {
  const shown =
    demand.shown ??
    (gates === undefined || typeof gates === 'string'
      ? gates
      : { address: gates.address, items: [gates.item] });
  if (shown === undefined) throw new Error('declares neither `shown` nor `gates`');
  const address = typeof shown === 'string' ? shown : shown.address;
  const entry = visibilityEntryOf(entries, address);
  const items = typeof shown === 'string' ? (entry.items ?? OWN_SWITCH) : shown.items;
  assertItemsIn(items, entry, address);

  let label: LabelEntry | undefined;
  if (demand.labelsCount) {
    label = entries.find((e): e is LabelEntry => 'of' in e && e.of === address);
    if (label === undefined) throw new Error(`no label entry is \`of\` '${address}'`);
    // An itemed label over an itemless entry has no item to read its switch by.
    if (label.items !== undefined) assertItemsIn(items, label, `label:${label.label}`);
  }

  const near = demand.near;
  const band = near === undefined ? undefined : entry.bands?.[near.band];
  if (near !== undefined && band === undefined) {
    throw new Error(`'${address}' has no band '${near.band}'`);
  }
  const wantsIn = near !== undefined && near.edge !== 'out';
  const wantsOut = near !== undefined && near.edge !== 'in';
  const inEdge = band?.in?.[0];
  const outEdge = band?.out?.[1];
  if (wantsIn && inEdge === undefined) {
    throw new Error(`band '${near!.band}' of '${address}' has no \`in\` edge`);
  }
  if (wantsOut && outEdge === undefined) {
    throw new Error(`band '${near!.band}' of '${address}' has no \`out\` edge`);
  }
  // Like the fade (`bandValueOf`), a band gates only the items it lists: one exempt item draws
  // the asset outside the band, so the row loads as if it had no `near`.
  const applies =
    band?.items === undefined ||
    items.every((item) => item !== undefined && band.items!.includes(item));

  const sizeBody = demand.size === undefined ? undefined : SCENE_BODY_BY_ID.get(demand.size.body);
  if (demand.size !== undefined && sizeBody === undefined) {
    throw new Error(`size names no scene body '${demand.size.body}'`);
  }
  const driver = sizeBody === undefined ? null : positionDriverOrNull(sizeBody.id);
  const host =
    driver?.kind === 'surfaceFixed'
      ? findByIdOrThrow(SCENE_CELESTIAL_BODIES, driver.hostId, 'size host')
      : undefined;

  return {
    entry,
    items,
    label,
    labelItems: label?.items === undefined ? OWN_SWITCH : items,
    band: applies ? band : undefined,
    inMpc: applies && wantsIn ? (inEdge ?? 0) : 0,
    outMpc: applies && wantsOut ? (outEdge ?? Infinity) : Infinity,
    sizeRadiusM: sizeBody === undefined ? 0 : bodyFootprintRadiusM(sizeBody),
    siteHost: host && { id: host.id, radiusM: innerBoundRadiusM(host.surface) },
    selects: 'selects' in entry ? entry.selects : undefined,
  };
}
