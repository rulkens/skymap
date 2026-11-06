import type { SelectionKindRow } from '../../@types/engine/layer/SelectionKindRow';

/**
 * Boot-time shape check for D5's composed selection rows: no two rows may claim
 * the same ref `type` or the same pick-source code, or the composed
 * resolver's dispatch would be order-dependent. Called once by `createLayers`
 * (Task 11), not per resolution.
 */
export function assertSelectionRowsDisjoint(rows: readonly SelectionKindRow[]): void {
  const seenTypes = new Set<string>();
  const seenSources = new Set<number>();
  for (const row of rows) {
    if (seenTypes.has(row.type)) {
      throw new Error(`assertSelectionRowsDisjoint: duplicate selection kind type "${row.type}"`);
    }
    seenTypes.add(row.type);
    for (const source of row.pickSources) {
      if (seenSources.has(source)) {
        throw new Error(`assertSelectionRowsDisjoint: duplicate pick source code "${source}"`);
      }
      seenSources.add(source);
    }
  }
}
