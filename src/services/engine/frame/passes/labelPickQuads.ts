/**
 * labelPickQuads — the drawn label set → clickable screen rectangles.
 *
 * The two label layers share this so a COSMO label and a NEAR0 caption become
 * pick geometry by the same rules, whichever declutter arm produced them: the
 * input is already the post-declutter, post-envelope set the renderer packed,
 * so nothing here re-decides visibility beyond "is it actually legible".
 *
 * `hasPickableLabel` lives beside it because it is the same decision one step
 * earlier — the layer's `pickEnabled` gate. It is deliberately the CHEAP half
 * (identity + alpha, no projection): admitting a frame whose labels all turn
 * out to be off-screen costs one empty draw, while a gate that could reject a
 * frame the emit would have filled is a silently dead pick.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { Label2DProjection } from '../../../../@types/rendering/Label2DProjection';
import type { LabelBBox } from '../../../../@types/rendering/LabelBBox';
import type { LabelPickQuad } from '../../../../@types/rendering/LabelPickQuad';
import type { ForwardProjectedPoint } from '../../../../@types/camera/ForwardProjectedPoint';
import { forwardProjectPoint } from '../../../../utils/camera/forwardProjectPoint';
import { labelScreenRect } from '../../../../utils/labels/labelScreenRect';
import { LABEL_PICK_GRACE_PADDING_PX } from '../../../../data/labels/labelPickGracePaddingPx';

/**
 * Whether any label in the drawn set could take a click: it names a selectable
 * subject (`pickId`) and has opacity left. An invisible label is never
 * pickable — the fade is the affordance, so a label mid-fade-out stays
 * clickable exactly as long as it stays readable.
 */
export function hasPickableLabel(labels: readonly Label2D[]): boolean {
  return labels.some((label) => label.pickId !== undefined && (label.fadeAlpha ?? 1) > 0);
}

/**
 * Screen rectangles for every label of `labels` that can take a click, in the
 * order they must be drawn: NEAREST SUBJECT FIRST, because every quad shares
 * one forced depth band and the depth test rejects equals, so the first
 * instance drawn owns a contested pixel. Depth is the label anchor's own
 * `clipW` — for a lifted label that is the lift's anchor rather than the
 * subject dot, which differs by a few screen px of parallax and never by
 * enough to reorder two labels the user could tell apart.
 *
 * Each rect is the measured ink box (`labelScreenRect`, the same math the
 * COSMO declutter tests overlaps with) inflated by the grace padding.
 */
export function labelPickQuads(args: {
  readonly labels: readonly Label2D[];
  readonly projection: Label2DProjection;
  readonly measure: (label: Label2D) => LabelBBox | null;
}): LabelPickQuad[] {
  const { labels, projection, measure } = args;
  const viewportHeightPx = projection.viewportPx[1];
  // One scratch for the whole loop — forwardProjectPoint mutates in place.
  const scratch: ForwardProjectedPoint = {
    clipX: 0,
    clipY: 0,
    clipZ: 0,
    clipW: 0,
    screenX: 0,
    screenY: 0,
    onScreen: false,
  };

  const rows: { quad: LabelPickQuad; clipW: number }[] = [];
  for (const label of labels) {
    const packedId = label.pickId;
    if (packedId === undefined) continue;
    if ((label.fadeAlpha ?? 1) <= 0) continue;
    const bbox = measure(label);
    if (bbox === null) continue; // lays out to no ink — nothing to click on
    forwardProjectPoint(
      projection.vp,
      label.worldPos[0],
      label.worldPos[1],
      label.worldPos[2],
      projection.viewportPx,
      scratch,
    );
    // Behind the camera: no screen position. Not gated on `onScreen` — that
    // tests the ANCHOR, and a centred label whose anchor sits just past the
    // edge still draws (and so must still be clickable) half on screen.
    if (scratch.clipW <= 0) continue;
    rows.push({
      clipW: scratch.clipW,
      quad: {
        rect: labelScreenRect({
          label,
          bbox,
          screenPx: [scratch.screenX, scratch.screenY],
          clipW: scratch.clipW,
          viewportHeightPx,
          padPx: LABEL_PICK_GRACE_PADDING_PX,
        }),
        packedId,
      },
    });
  }

  rows.sort((a, b) => a.clipW - b.clipW);
  return rows.map((row) => row.quad);
}
