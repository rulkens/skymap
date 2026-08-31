/**
 * labelPickQuads — the drawn label set → clickable screen rectangles, shared
 * by both label layers so a COSMO label and a NEAR0 caption become pick
 * geometry by the same rules. Input is already the post-declutter set the
 * renderer packed, so nothing here re-decides visibility.
 *
 * `hasPickableLabel` (the `pickEnabled` gate) is deliberately the CHEAP half
 * — identity + alpha, no projection: a gate that rejects a frame the emit
 * would fill is a silently dead pick, worse than an empty draw.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { Label2DProjection } from '../../../../@types/rendering/Label2DProjection';
import type { LabelBBox } from '../../../../@types/rendering/LabelBBox';
import type { LabelPickQuad } from '../../../../@types/rendering/LabelPickQuad';
import { labelScreenRect } from '../../../../utils/labels/labelScreenRect';
import { projectLabels } from '../../../../utils/labels/projectLabels';
import { LABEL_PICK_GRACE_PADDING_PX } from '../../../../data/labels/labelPickGracePaddingPx';

/**
 * Whether a label could take a click: it names a selectable subject
 * (`pickId`) and has opacity left. An invisible label is never pickable —
 * the fade is the affordance, so a label mid-fade-out stays clickable
 * exactly as long as it stays readable. The one predicate both the cheap
 * `hasPickableLabel` gate and the quad-emit loop below test.
 */
function isPickableLabel(label: Label2D): boolean {
  return label.pickId !== undefined && (label.fadeAlpha ?? 1) > 0;
}

export function hasPickableLabel(labels: readonly Label2D[]): boolean {
  return labels.some(isPickableLabel);
}

/**
 * Screen rectangles for every label of `labels` that can take a click, in the
 * order they must be drawn: NEAREST SUBJECT FIRST, since every quad shares one
 * forced depth band and the depth test rejects equals, so the first instance
 * drawn owns a contested pixel. Depth is the label anchor's own `clipW` — for
 * a lifted label that's the lift's anchor, not the subject dot, which differs
 * by only a few screen px of parallax and never enough to reorder two labels
 * a user could tell apart.
 *
 * Each rect is the measured ink box (`labelScreenRect`) inflated by both the
 * grace padding and the painted outline's fringe (`includeOutline`) — a
 * pickable style's outline extends well past the ink, and an unclickable
 * fringe would read as a dead zone right where the label looks solid.
 */
export function labelPickQuads(args: {
  readonly labels: readonly Label2D[];
  readonly projection: Label2DProjection;
  readonly measure: (label: Label2D) => LabelBBox | null;
}): LabelPickQuad[] {
  const { labels, projection, measure } = args;
  const viewportHeightPx = projection.viewportPx[1];
  // Shared with the declutter arms (`label2DDirector`) — a label cannot be
  // decluttered against one screen position and clicked at another.
  const projected = projectLabels(labels, projection);

  const rows: { quad: LabelPickQuad; clipW: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (!isPickableLabel(label)) continue;
    const bbox = measure(label);
    if (bbox === null) continue; // lays out to no ink — nothing to click on
    const p = projected[i]!;
    // Behind the camera: no screen position. Not gated on `onScreen` — that
    // tests the ANCHOR, and a centred label whose anchor sits just past the
    // edge still draws (and so must still be clickable) half on screen.
    if (p.screenPx === null) continue;
    rows.push({
      clipW: p.clipW,
      quad: {
        rect: labelScreenRect({
          label,
          bbox,
          screenPx: p.screenPx,
          clipW: p.clipW,
          viewportHeightPx,
          padPx: LABEL_PICK_GRACE_PADDING_PX,
          // Outline styles paint up to `outlineEmFrac * displayEmPx` past the
          // ink (labels/vertex.wesl's quad expansion) — the pick rect must
          // cover that fringe too, or a click on the painted outline misses.
          includeOutline: true,
        }),
        packedId: label.pickId!,
      },
    });
  }

  rows.sort((a, b) => a.clipW - b.clipW);
  return rows.map((row) => row.quad);
}
