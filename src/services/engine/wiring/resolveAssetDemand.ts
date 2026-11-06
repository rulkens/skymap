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

  let label: LabelEntry | undefined;
  if (demand.labelsCount) {
    label = entries.find((e): e is LabelEntry => 'of' in e && e.of === address);
    if (label === undefined) throw new Error(`no label entry is \`of\` '${address}'`);
  }

  const near = demand.near;
  const band = near === undefined ? undefined : entry.bands?.[near.band];
  if (near !== undefined && band === undefined) {
    throw new Error(`'${address}' has no band '${near.band}'`);
  }
  const edge =
    near === undefined ? undefined : near.edge === 'out' ? band?.out?.[1] : band?.in?.[0];
  if (near !== undefined && edge === undefined) {
    throw new Error(`band '${near.band}' of '${address}' has no \`${near.edge}\` edge`);
  }

  return {
    entry,
    items,
    label,
    labelItems: label?.items === undefined ? OWN_SWITCH : items,
    band,
    edgeMpc: edge ?? 0,
    selects: 'selects' in entry ? entry.selects : undefined,
  };
}
