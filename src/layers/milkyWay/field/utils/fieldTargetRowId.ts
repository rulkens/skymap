import type { FieldTargetId } from '../@types/FieldTargetId';

/** The render-target row id a field target is allocated under; the rows and their readers share it. */
export function fieldTargetRowId(id: FieldTargetId): string {
  return `mw-field-${id}`;
}
