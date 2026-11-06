/**
 * Resolves a declared demand against the composed entries: which switches count, which label
 * entry joins them, and `near`'s band edge. Every way a declaration can name nothing throws
 * here, so `assertAssetDemands` catches it at table build instead of the per-row guard
 * swallowing it every frame.
 */

import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DeclaredDemand } from '../../../@types/loading/DeclaredDemand';
import type { DemandResolution } from '../../../@types/loading/DemandResolution';
import type { LabelEntry } from '../../../@types/engine/layer/LabelEntry';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';

const OWN_SWITCH: readonly undefined[] = [undefined];

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

  return {
    entry,
    items,
    label,
    labelItems: label?.items === undefined ? OWN_SWITCH : items,
    band: applies ? band : undefined,
    inMpc: applies && wantsIn ? (inEdge ?? 0) : 0,
    outMpc: applies && wantsOut ? (outEdge ?? Infinity) : Infinity,
    selects: 'selects' in entry ? entry.selects : undefined,
  };
}
