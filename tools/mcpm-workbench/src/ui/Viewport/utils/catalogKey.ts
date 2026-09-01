import type { AppState } from '../../../../@types/AppState';

/**
 * `packedDropId`/`packedSourceName` stand in for the dropped catalog's
 * identity — cheap to JSON.stringify every store notification (incl. every
 * running-sim frame), where the override's own Float32Arrays would not be.
 * The id (not the name alone) is what actually triggers a rebuild: the
 * fork exports its packed catalog under the same default filename on every
 * run, so re-dropping a regenerated file — the realistic repeat workflow —
 * would leave a name-only key unchanged and silently starve the reload.
 */
export function catalogKey(s: AppState): unknown[] {
  return [s.catalog.sources, s.catalog.tier, s.catalog.packedDropId, s.catalog.packedSourceName];
}
