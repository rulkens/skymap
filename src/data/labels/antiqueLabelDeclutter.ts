import type { Label2DDeclutterPolicy } from '../../@types/engine/subsystems/Label2DDeclutterPolicy';

/**
 * ANTIQUE_LABEL_DECLUTTER — how both label directors cut colliding names while the
 * antique look is on: by measured text rect, COSMO's own policy. The look's names
 * run long, beside their signs, some with a modern gloss beneath, so NEAR0's
 * anchor-distance cull lets anchors far apart print over each other. The plain
 * look keeps that cheaper cull: rects cost `labels:near0` about 0.1–0.2 ms a frame
 * (`npm run perf:cpu`, star-field and earth-copenhagen-500km, 2026-11-07).
 */
export const ANTIQUE_LABEL_DECLUTTER: Label2DDeclutterPolicy = { mode: 'bboxOverlap', padPx: 8 };
