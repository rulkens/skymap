import type { AssetWiringRow } from '../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../@types/loading/CompanionAssetRow';

function isCompanion(row: AssetWiringRow | CompanionAssetRow): row is CompanionAssetRow {
  return 'companionOf' in row;
}

/**
 * Fold `CompanionAssetRow`s into full `AssetWiringRow`s once, at table-build
 * time — so `reevaluateDemand`, `buildSlotsFromRegistry` and the debug panel
 * all walk the same plain rows the demand loop runs (Ruling 6). Own rows
 * pass through by identity; a companion's parent is looked up among the OWN
 * rows only, so a parent that is itself a companion reads as missing rather
 * than chaining — a chain would otherwise surface as a `TypeError` inside a
 * demand predicate, swallowed by the per-row guard, starving one asset
 * silently.
 */
export function expandCompanionRows(
  rows: readonly (AssetWiringRow | CompanionAssetRow)[],
): readonly AssetWiringRow[] {
  const ownByKey = new Map<AssetWiringRow['key'], AssetWiringRow>();
  for (const row of rows) {
    if (!isCompanion(row)) ownByKey.set(row.key, row);
  }

  return rows.map((row) => {
    if (!isCompanion(row)) return row;
    const parent = ownByKey.get(row.companionOf);
    if (parent === undefined) {
      throw new Error(
        `expandCompanionRows: '${String(row.key)}' companions '${String(row.companionOf)}', which is missing or is itself a companion`,
      );
    }
    return {
      key: row.key,
      factory: row.factory,
      req: parent.req,
      demand: (ctx) => ctx.slotState(row.companionOf) !== 'idle',
      priority: parent.priority + 1,
    };
  });
}
