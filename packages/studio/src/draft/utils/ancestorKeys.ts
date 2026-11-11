/** The row ids of the blocks holding a row: every effect on its path above it, its Fly for a waypoint. */
import { rowKey } from './rowKey';
import type { RowRef } from '../../@types/rows/RowRef';

export function ancestorKeys(ref: Exclude<RowRef, { kind: 'start' }>): string[] {
  const depth = ref.kind === 'waypoint' ? ref.path.length : ref.path.length - 1;
  return Array.from({ length: depth }, (_, i) =>
    rowKey({ kind: 'effect', path: ref.path.slice(0, i + 1) }),
  );
}
