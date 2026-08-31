import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { GridBox } from './GridBox';
import type { GizmoHandleId } from './GizmoHandleId';

/**
 * GizmoDragState — Viewport's closure-local record of an in-flight gizmo drag (spec §5's "State
 * flow"), matching the `dragging`/`panning` closure-variable pattern rather than a store field.
 * `anchorBox` is the box at pointerdown; drag math must run against this fixed anchor, never a
 * box re-derived per pointermove — a live re-derive makes resize's center chase half the delta
 * each event, a converging feedback loop instead of a stable 1:1 cursor mapping.
 */
export type GizmoDragState =
  | {
      readonly handle: Extract<GizmoHandleId, { kind: 'translate' | 'resize' }>;
      readonly anchorAxisParam: number;
      readonly anchorBox: GridBox;
    }
  | {
      readonly handle: Extract<GizmoHandleId, { kind: 'rotate' }>;
      readonly anchorAngleRad: number;
      readonly anchorRotation: Readonly<Vec4>;
    };
