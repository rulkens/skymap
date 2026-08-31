import type { GizmoHandleId } from '../../@types/GizmoHandleId';

/**
 * encodeGizmoHandleId — flattens a GizmoHandleId to a single int for the boxPreviewPass GPU
 * uniform (F1.4): `kind*100 + axis*10 + (sign === -1 ? 1 : 0)`, kind 0 translate / 1 resize /
 * 2 rotate; `null` (no hover/active handle) encodes to `-1`.
 */
export function encodeGizmoHandleId(id: GizmoHandleId | null): number {
  if (id === null) return -1;
  const kind = id.kind === 'translate' ? 0 : id.kind === 'resize' ? 1 : 2;
  const sign = id.kind === 'resize' && id.sign === -1 ? 1 : 0;
  return kind * 100 + id.axis * 10 + sign;
}
