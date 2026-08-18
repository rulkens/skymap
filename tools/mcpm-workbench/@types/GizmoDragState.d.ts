import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { GizmoHandleId } from './GizmoHandleId';

/**
 * GizmoDragState — Viewport's closure-local record of an in-flight gizmo drag (spec §5's "State
 * flow"), matching the `dragging`/`panning` closure-variable pattern rather than a store field.
 * The rotate variant exists for type stability only — `pickGizmoHandle` can never return a
 * `rotate` id in F1 (`gizmoHandleGeometry`'s zero-radius ring stubs), so it stays INERT until F2.
 */
export type GizmoDragState =
  | {
      readonly handle: Extract<GizmoHandleId, { kind: 'translate' | 'resize' }>;
      readonly anchorAxisParam: number;
    }
  | {
      readonly handle: Extract<GizmoHandleId, { kind: 'rotate' }>;
      readonly anchorAngleRad: number;
      readonly anchorRotation: Readonly<Vec4>;
    };
