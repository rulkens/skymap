/**
 * GizmoHandleId — which gizmo handle a pick/hover/drag refers to. `translate` and `resize` are
 * driven this task (F1); `rotate` exists so `GizmoHandleGeometry` has a stable shape, but its
 * radiusMpc-0 stub geometry (`gizmoHandleGeometry.ts`) means `pickGizmoHandle` never returns one
 * until F2. Encoded to a flat GPU-uniform int by `encodeGizmoHandleId`.
 */
export type GizmoHandleId =
  | { readonly kind: 'translate'; readonly axis: 0 | 1 | 2 }
  | { readonly kind: 'resize'; readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }
  | { readonly kind: 'rotate'; readonly axis: 0 | 1 | 2 };
