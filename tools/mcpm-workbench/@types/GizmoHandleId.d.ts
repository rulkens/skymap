/**
 * GizmoHandleId — which gizmo handle a pick/hover/drag refers to: `translate`/`resize` (F1) and
 * `rotate` (F2.5's rings). Encoded to a flat GPU-uniform int by `encodeGizmoHandleId`.
 */
export type GizmoHandleId =
  | { readonly kind: 'translate'; readonly axis: 0 | 1 | 2 }
  | { readonly kind: 'resize'; readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }
  | { readonly kind: 'rotate'; readonly axis: 0 | 1 | 2 };
