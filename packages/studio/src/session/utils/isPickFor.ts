/** Whether a pending pick belongs to the field an action names: the same row and param. */
import { rowKey } from '../../draft/utils/rowKey';
import type { PickStatus } from '../../@types/session/PickStatus';
import type { RowRef } from '../../@types/rows/RowRef';

export function isPickFor(
  pick: PickStatus,
  field: { readonly ref: RowRef; readonly param: string },
): boolean {
  return pick.row === rowKey(field.ref) && pick.param === field.param;
}
