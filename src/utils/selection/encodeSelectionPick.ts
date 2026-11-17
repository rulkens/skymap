/**
 * encodeSelectionPick — the packed pick word a ref's own geometry stamps, via
 * the one row that owns its `type`. The inverse of `resolvePick`; null when no
 * row claims the type or the row cannot resolve the ref right now.
 */

import type { SelectionKindRow } from '../../@types/engine/layer/SelectionKindRow';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

export function encodeSelectionPick(
  rows: readonly SelectionKindRow[],
  ref: SelectionRefBase | null,
): number | null {
  if (ref === null) return null;
  return rows.find((r) => r.type === ref.type)?.encodePick(ref) ?? null;
}
