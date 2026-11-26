import type { GizmoDragState } from '../../@types/gizmo/GizmoDragState';
import type { AxisDragState } from '../../@types/input/AxisDragState';

export function isAxisDrag(drag: GizmoDragState): drag is AxisDragState {
  return drag.handle.kind !== 'rotate';
}
