/**
 * How a `Label2DDirector` instance resolves on-screen label collisions.
 * `bboxOverlap` (COSMO) tests measured, em-clamped text rects for padded
 * intersection; `screenSeparation` (NEAR0, unimplemented until the
 * mechanism-unification work lands its second arm) tests raw anchor
 * distance instead — cheaper, appropriate where text metrics aren't
 * available at declutter time.
 */
export type Label2DDeclutterPolicy =
  | { readonly mode: 'bboxOverlap'; readonly padPx: number }
  | { readonly mode: 'screenSeparation'; readonly minSeparationPx: number };
