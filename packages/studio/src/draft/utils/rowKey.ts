/** A row's stable id from its ref: 'start', 'e:0.2.1', 'w:0.2.1/3'. Selection and collapse store these. */
import type { RowRef } from '../../@types/rows/RowRef';

export function rowKey(ref: RowRef): string {
  if (ref.kind === 'start') return 'start';
  const path = ref.path.join('.');
  return ref.kind === 'effect' ? `e:${path}` : `w:${path}/${ref.index}`;
}
