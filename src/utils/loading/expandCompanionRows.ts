import type { AssetWiringRow } from '../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../@types/loading/CompanionAssetRow';

function isCompanion(row: AssetWiringRow | CompanionAssetRow): row is CompanionAssetRow {
  return 'companionOf' in row;
}

/**
 * Fold `CompanionAssetRow`s into plain `AssetWiringRow`s once, at table-build time.
 * A companion's parent is looked up among the OWN rows only, so a chain throws here
 * rather than as a `TypeError` swallowed by the per-row guard, silently starving an asset.
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
      slot: row.slot,
      req: parent.req,
      demand: (ctx) => ctx.slotState(row.companionOf) !== 'idle',
      priority: parent.priority + 1,
    };
  });
}
