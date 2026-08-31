/**
 * ForegroundCaption — the caption shape the near-field `foregroundLabelsLayer`
 * draws.
 *
 * A `Label` whose tint, em height, and pixel clamps are ALWAYS authored —
 * unlike the general `Label`, where those fields are optional and fall back to
 * renderer defaults — tagged with a `kind` that drives the layer's declutter
 * priority (`CAPTION_PRIORITY`) and fade routing. Narrowing the required fields
 * here states that guarantee once at the type, so the layer hands them to
 * `liftedLabelPlacement` (which requires plain `number`s) without a per-field
 * `?? default` that would silently mask a caption built without its colour or
 * clamps.
 *
 * Two producers build this shape and the layer merges both into ONE declutter +
 * envelope pass: `sceneBodyLabels` (Earth + the planets + the local star map)
 * and `constellationCaptions` (the stick-figure names). Sharing one type — kept
 * in its own module so neither producer imports the other — is what lets the
 * pipeline stay source-agnostic: it reads `kind`, `worldPos`, and the required
 * fields off every entry without caring which producer made it. The scene-body
 * captions ride a body anchor and hang off a leader line; the constellation
 * captions anchor in empty space at a figure centroid and emit direct, but both
 * are the same caption to the declutter and the alpha envelope.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { CaptionKind } from './captionPriority';

export type ForegroundCaption = Label2D &
  Required<Pick<Label2D, 'color' | 'worldEmMpc' | 'minPixelSize' | 'maxPixelSize'>> & {
    readonly kind: CaptionKind;
  };
